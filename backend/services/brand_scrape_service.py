"""Brand profile scraper — fetch a website URL and extract brand metadata.

Pipeline:
  1. Fetch HTML via httpx (10s timeout, browser user-agent)
  2. Parse with BeautifulSoup — pull OpenGraph/meta/favicon/header logos
  3. Download the best logo candidate to BRANDS_PATH/<temp id>/logo.<ext>
  4. Send cleaned page text to Gemini to infer industry / tone / audience
  5. Return a pre-filled BrandProfile dict for the frontend to display
"""
from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from config import settings
from services.gemini_service import (
    GeminiError,
    get_gemini_service,
)
from services.storage_service import get_asset_url

logger = logging.getLogger(__name__)


SCRAPE_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Skyie-Studio-BrandBot/1.0"
)
SCRAPE_TIMEOUT = 10.0
MAX_HTML_BYTES = 3 * 1024 * 1024  # 3MB cap
MAX_LOGO_BYTES = 5 * 1024 * 1024  # 5MB cap
TEXT_SAMPLE_CHARS = 6000  # clipped text fed to Gemini

HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

BRAND_EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "tagline": {"type": "string"},
        "description": {"type": "string"},
        "industry": {"type": "string"},
        "tone_of_voice": {"type": "string"},
        "target_audience": {"type": "string"},
        "guidelines": {"type": "string"},
        "key_messages": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["name", "description", "industry", "tone_of_voice", "target_audience"],
}


class BrandScrapeError(Exception):
    pass


def _normalize_url(url: str) -> str:
    url = url.strip()
    if not url:
        raise BrandScrapeError("URL is required")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    parsed = urlparse(url)
    if not parsed.netloc:
        raise BrandScrapeError(f"Invalid URL: {url}")
    return url


async def _fetch_html(url: str) -> tuple[str, str]:
    """Return (final_url, html_text)."""
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=SCRAPE_TIMEOUT,
        headers={
            "User-Agent": SCRAPE_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
        limits=httpx.Limits(max_keepalive_connections=5),
    ) as client:
        try:
            resp = await client.get(url)
        except httpx.HTTPError as e:
            raise BrandScrapeError(f"Failed to fetch {url}: {e}") from e
        if resp.status_code >= 400:
            raise BrandScrapeError(f"Fetch returned HTTP {resp.status_code} for {url}")
        content = resp.content[:MAX_HTML_BYTES]
        # Best-effort decode — trust the server's declared encoding first.
        html = content.decode(resp.encoding or "utf-8", errors="replace")
        return str(resp.url), html


_SVG_VIEWBOX_RE = re.compile(rb'\bviewBox\s*=', re.IGNORECASE)
_SVG_WIDTH_RE = re.compile(rb'\bwidth\s*=\s*"([^"]+)"', re.IGNORECASE)
_SVG_HEIGHT_RE = re.compile(rb'\bheight\s*=\s*"([^"]+)"', re.IGNORECASE)
_SVG_OPEN_TAG_RE = re.compile(rb"<svg\b[^>]*>", re.IGNORECASE)


def _normalize_svg_for_display(raw: bytes) -> bytes:
    """Ensure the SVG has a viewBox so it scales correctly inside <img>.

    SVGs with explicit width/height but no viewBox render at their intrinsic
    pixel size in Safari and some Chrome versions, overflowing thumbnail
    containers. We inject a viewBox derived from width/height when missing.
    Also strip any UTF-8 BOM and leading whitespace before <svg>.
    """
    if raw[:3] == b"\xef\xbb\xbf":
        raw = raw[3:]
    raw = raw.lstrip()

    if not raw.startswith(b"<?xml") and not raw.lower().startswith(b"<svg"):
        return raw  # Not recognizable SVG, leave alone

    open_match = _SVG_OPEN_TAG_RE.search(raw)
    if not open_match:
        return raw
    open_tag = open_match.group(0)

    if _SVG_VIEWBOX_RE.search(open_tag):
        return raw  # Already has viewBox

    def parse_dim(value: bytes) -> Optional[float]:
        try:
            s = value.decode("ascii", "ignore").strip().lower()
            for suffix in ("px", "pt", "em", "rem", "%"):
                if s.endswith(suffix):
                    s = s[: -len(suffix)]
                    break
            return float(s)
        except Exception:
            return None

    w_m = _SVG_WIDTH_RE.search(open_tag)
    h_m = _SVG_HEIGHT_RE.search(open_tag)
    w = parse_dim(w_m.group(1)) if w_m else None
    h = parse_dim(h_m.group(1)) if h_m else None
    if not w or not h or w <= 0 or h <= 0:
        w = w or 100.0
        h = h or 100.0

    viewbox = f' viewBox="0 0 {int(w)} {int(h)}"'.encode("ascii")
    new_open_tag = open_tag[:4] + viewbox + open_tag[4:]
    return raw.replace(open_tag, new_open_tag, 1)


async def _download_logo(logo_url: str, dest_dir: Path) -> Optional[str]:
    """Download a logo candidate and return its local path, or None on failure."""
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=SCRAPE_TIMEOUT,
            headers={"User-Agent": SCRAPE_USER_AGENT},
        ) as client:
            resp = await client.get(logo_url)
            if resp.status_code >= 400 or not resp.content:
                return None
            raw = resp.content[:MAX_LOGO_BYTES]

        # Pick an extension from content-type, fall back to URL
        ctype = resp.headers.get("content-type", "").lower()
        ext = ".png"
        if "svg" in ctype:
            ext = ".svg"
        elif "jpeg" in ctype or "jpg" in ctype:
            ext = ".jpg"
        elif "webp" in ctype:
            ext = ".webp"
        elif "ico" in ctype:
            ext = ".ico"
        else:
            url_ext = Path(urlparse(logo_url).path).suffix.lower()
            if url_ext in {".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico"}:
                ext = url_ext if url_ext != ".jpeg" else ".jpg"

        if ext == ".svg":
            raw = _normalize_svg_for_display(raw)

        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"logo{ext}"
        dest.write_bytes(raw)
        return str(dest)
    except Exception as e:
        logger.warning("brand logo download failed for %s: %s", logo_url, e)
        return None


def _pick_logo_candidates(soup: BeautifulSoup, base_url: str) -> list[str]:
    """Return logo URL candidates ordered best → worst.

    Walks the entire document (not just <header>), scores by keyword hits in
    src/alt/class/id/parent-class/aria-label, weights SVG and header/nav
    ancestors, and falls back to <link rel="icon"> and OpenGraph images.
    """
    scored: dict[str, int] = {}

    def bump(value: Optional[str], score: int):
        if not value:
            return
        url = urljoin(base_url, value)
        if scored.get(url, -1) < score:
            scored[url] = score

    # ── 1. <link rel="..."> — icons, preloads, and explicit logos ──────
    for link in soup.find_all("link", rel=True):
        rel = " ".join(link.get("rel") or []).lower()
        type_attr = (link.get("type") or "").lower()
        sizes_attr = (link.get("sizes") or "").lower()
        as_attr = (link.get("as") or "").lower()
        href = link.get("href")
        if not href:
            continue
        href_lower = href.lower()
        looks_like_logo = "logo" in href_lower or "wordmark" in href_lower
        is_svg = href_lower.endswith(".svg") or "svg" in type_attr

        # <link rel="preload" as="image" href="/logo.svg"> — Next.js / Vite
        # sites preload above-the-fold images this way, including their real
        # wordmark logos. Score very high when the href looks logo-ish.
        if "preload" in rel and as_attr == "image":
            score = 60
            if looks_like_logo:
                score = 230 if is_svg else 200
            elif is_svg:
                score = 120
            bump(href, score)
            continue

        # SVG favicon is almost always the real wordmark/logomark → top priority
        if "icon" in rel and is_svg:
            bump(href, 220)
            continue

        if "apple-touch-icon" in rel:
            size_score = 0
            if "180" in sizes_attr:
                size_score = 15
            elif "152" in sizes_attr:
                size_score = 10
            elif "120" in sizes_attr:
                size_score = 5
            bump(href, 150 + size_score)
        elif "mask-icon" in rel:
            bump(href, 140)
        elif rel.strip() == "icon":
            if "512" in sizes_attr:
                bump(href, 170)
            elif "192" in sizes_attr:
                bump(href, 150)
            elif "96" in sizes_attr:
                bump(href, 90)
            elif "32" in sizes_attr or "16" in sizes_attr:
                bump(href, 60)
            else:
                bump(href, 110)
        elif "shortcut icon" in rel:
            bump(href, 55)

    # ── 2. <img> tags across the whole document ─────────────────────
    for img in soup.find_all("img", limit=400):
        src = (
            img.get("src")
            or img.get("data-src")
            or img.get("data-lazy-src")
            or img.get("data-original")
        )
        if not src:
            continue
        # Skip obvious data-URIs — not useful as logo candidates
        if src.startswith("data:"):
            continue

        alt = (img.get("alt") or "").lower()
        cls = " ".join(img.get("class") or []).lower()
        img_id = (img.get("id") or "").lower()
        aria = (img.get("aria-label") or "").lower()
        src_l = src.lower()

        parent_cls = ""
        ancestor_tags: list[str] = []
        node = img.parent
        depth = 0
        while node is not None and depth < 6:
            name = getattr(node, "name", None)
            if name:
                ancestor_tags.append(name)
            pcls = node.get("class") if hasattr(node, "get") else None
            if pcls:
                parent_cls += " " + " ".join(pcls).lower()
            node = getattr(node, "parent", None)
            depth += 1

        haystack = f"{alt} {cls} {img_id} {aria} {parent_cls} {src_l}"

        score = 0
        if "wordmark" in haystack:
            score += 180
        if "logo" in haystack:
            score += 160
        if "brand" in haystack:
            score += 70
        if any(t in ancestor_tags for t in ("header", "nav")):
            score += 50

        # File-format boost
        if src_l.endswith(".svg"):
            score += 40
        elif src_l.endswith(".png"):
            score += 10

        if score > 0:
            bump(src, score)

    # ── 3. Inline <svg> in <header>/<nav> ─────────────────────────────
    # (We can't easily extract these — only flag the fact that they exist
    # in extra metadata. Left for a future pass.)

    # ── 4. Meta tags ──────────────────────────────────────────────────
    # Some sites use <meta property="og:logo"> — rare but accurate.
    og_logo = soup.find("meta", property="og:logo")
    if og_logo and og_logo.get("content"):
        bump(og_logo["content"], 130)

    og_image = soup.find("meta", property="og:image")
    if og_image and og_image.get("content"):
        bump(og_image["content"], 35)

    # Twitter image
    tw_image = soup.find("meta", attrs={"name": "twitter:image"})
    if tw_image and tw_image.get("content"):
        bump(tw_image["content"], 30)

    ranked = sorted(scored.items(), key=lambda p: p[1], reverse=True)
    return [url for url, _ in ranked[:15]]


_SVG_HEX_RE = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b")
_SVG_RGB_RE = re.compile(
    r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)"
)


def _is_saturated_non_neutral(r: int, g: int, b: int) -> bool:
    max_c, min_c = max(r, g, b), min(r, g, b)
    lum = (r + g + b) / 3.0
    saturation = (max_c - min_c) / max_c if max_c else 0.0
    if lum > 240 or lum < 18:
        return False
    if saturation < 0.18:
        return False
    return True


def _extract_colors_from_svg(svg_path: str) -> dict[str, Optional[str]]:
    """Parse an SVG and pick up to 3 distinct saturated fill colors."""
    try:
        content = Path(svg_path).read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return {}

    ordered: list[str] = []
    seen: set[str] = set()

    def consider(r: int, g: int, b: int):
        if not _is_saturated_non_neutral(r, g, b):
            return
        hex_color = f"#{r:02x}{g:02x}{b:02x}"
        if hex_color in seen:
            return
        seen.add(hex_color)
        ordered.append(hex_color)

    for match in _SVG_HEX_RE.finditer(content):
        hex_raw = match.group(1).lower()
        if len(hex_raw) == 3:
            hex_raw = "".join(c * 2 for c in hex_raw)
        r = int(hex_raw[0:2], 16)
        g = int(hex_raw[2:4], 16)
        b = int(hex_raw[4:6], 16)
        consider(r, g, b)
        if len(ordered) >= 6:
            break

    for match in _SVG_RGB_RE.finditer(content):
        r, g, b = int(match.group(1)), int(match.group(2)), int(match.group(3))
        if 0 <= r <= 255 and 0 <= g <= 255 and 0 <= b <= 255:
            consider(r, g, b)
            if len(ordered) >= 6:
                break

    result: dict[str, Optional[str]] = {}
    if ordered:
        result["primary_color"] = ordered[0]
    if len(ordered) > 1:
        result["secondary_color"] = ordered[1]
    if len(ordered) > 2:
        result["accent_color"] = ordered[2]
    return result


def _extract_palette_from_image(image_path: str) -> dict[str, Optional[str]]:
    """Return up to 3 dominant saturated colors from an image as hex strings.

    Dispatches to a regex SVG parser for .svg files (Pillow can't rasterize
    vectors without CairoSVG), and Pillow median-cut for raster formats.
    """
    p = Path(image_path)
    ext = p.suffix.lower()

    if ext == ".svg":
        return _extract_colors_from_svg(image_path)
    if ext == ".ico":
        return {}

    try:
        from PIL import Image
    except Exception:
        return {}

    if not p.exists() or p.stat().st_size == 0:
        return {}

    try:
        img = Image.open(image_path)
        img = img.convert("RGBA")
        img.thumbnail((400, 400))

        # Flatten transparent pixels onto white so quantizer doesn't see alpha
        bg = Image.new("RGB", img.size, (255, 255, 255))
        alpha = img.split()[3] if img.mode == "RGBA" else None
        bg.paste(img, mask=alpha)

        quantized = bg.quantize(colors=12, method=Image.MEDIANCUT)
        palette_raw = quantized.getpalette() or []
        counts = sorted(quantized.getcolors() or [], reverse=True)

        picked: list[str] = []
        for count, idx in counts:
            base = idx * 3
            if base + 2 >= len(palette_raw):
                continue
            r, g, b = palette_raw[base], palette_raw[base + 1], palette_raw[base + 2]

            if not _is_saturated_non_neutral(r, g, b):
                continue

            hex_color = f"#{r:02x}{g:02x}{b:02x}"
            if hex_color in picked:
                continue
            picked.append(hex_color)
            if len(picked) >= 3:
                break

        result: dict[str, Optional[str]] = {}
        if picked:
            result["primary_color"] = picked[0]
        if len(picked) > 1:
            result["secondary_color"] = picked[1]
        if len(picked) > 2:
            result["accent_color"] = picked[2]
        return result
    except Exception as e:
        logger.warning("palette extraction failed for %s: %s", image_path, e)
        return {}


async def _download_og_image(soup: BeautifulSoup, base_url: str, dest_dir: Path) -> Optional[str]:
    """Try to download og:image (or twitter:image) for richer color extraction."""
    for prop in ("og:image:secure_url", "og:image"):
        el = soup.find("meta", property=prop)
        if el and el.get("content"):
            return await _download_logo(urljoin(base_url, el["content"]), dest_dir)
    el = soup.find("meta", attrs={"name": "twitter:image"})
    if el and el.get("content"):
        return await _download_logo(urljoin(base_url, el["content"]), dest_dir)
    return None


def _extract_colors(soup: BeautifulSoup) -> dict[str, Optional[str]]:
    """Extract theme color hints from meta tags."""
    theme = soup.find("meta", attrs={"name": "theme-color"})
    theme_color = None
    if theme and theme.get("content"):
        c = theme["content"].strip()
        if HEX_COLOR_RE.match(c):
            theme_color = c.lower()
    return {"primary_color": theme_color}


def _extract_text_and_meta(soup: BeautifulSoup) -> dict[str, Any]:
    """Pull visible text and structured meta from parsed HTML."""

    def og(prop: str) -> Optional[str]:
        el = soup.find("meta", property=prop)
        return el.get("content").strip() if el and el.get("content") else None

    def meta_name(name: str) -> Optional[str]:
        el = soup.find("meta", attrs={"name": name})
        return el.get("content").strip() if el and el.get("content") else None

    title_el = soup.find("title")
    site_title = title_el.get_text(strip=True) if title_el else None
    og_site_name = og("og:site_name")
    og_title = og("og:title")
    description = og("og:description") or meta_name("description")
    keywords = meta_name("keywords")

    # Strip script/style/noscript before grabbing visible text
    for tag in soup(["script", "style", "noscript", "template"]):
        tag.decompose()
    visible_text = " ".join(soup.get_text(separator=" ").split())
    sampled = visible_text[:TEXT_SAMPLE_CHARS]

    return {
        "name_candidate": og_site_name or og_title or site_title,
        "title": site_title,
        "og_title": og_title,
        "description": description,
        "keywords": keywords,
        "sampled_text": sampled,
    }


def _build_llm_prompt(source_url: str, meta: dict[str, Any]) -> str:
    return (
        "You are a brand strategist. I will give you raw content scraped from "
        "a company's website. Extract a concise brand profile as JSON matching "
        "the provided schema. Use the page copy to infer industry, tone of voice, "
        "target audience, and a short description. If the site already names the "
        "brand explicitly, use that as `name`. Keep each field under 400 characters. "
        "Write guidelines as a bulleted style note a content creator can follow.\n\n"
        f"SOURCE URL: {source_url}\n"
        f"PAGE TITLE: {meta.get('title') or ''}\n"
        f"META DESCRIPTION: {meta.get('description') or ''}\n"
        f"KEYWORDS: {meta.get('keywords') or ''}\n"
        f"VISIBLE TEXT (clipped):\n{meta.get('sampled_text') or ''}"
    )


async def scrape_brand_from_url(
    url: str, *, user_id: Optional[str] = None
) -> dict[str, Any]:
    """Main entry: scrape `url`, return a prefilled brand profile dict.

    Includes a temp `_scrape_id` that owns the downloaded logo directory —
    the caller turns it into a persistent BrandProfile by writing to the DB
    and moving the logo to the brand's final dir.
    """
    url = _normalize_url(url)
    final_url, html = await _fetch_html(url)

    soup = BeautifulSoup(html, "html.parser")
    meta = _extract_text_and_meta(soup)
    colors = _extract_colors(soup)
    logo_candidates = _pick_logo_candidates(soup, final_url)

    # Download the best logo into a scrape-scoped temp directory
    scrape_id = uuid.uuid4().hex
    scrape_dir = Path(settings.BRANDS_PATH) / f"_scrape_{scrape_id}"
    logo_path: Optional[str] = None
    for candidate in logo_candidates:
        logo_path = await _download_logo(candidate, scrape_dir)
        if logo_path:
            break

    # Download the hero/og:image separately — it's usually the richest source
    # of brand colors (the logo itself may be a single solid color).
    og_image_path = await _download_og_image(soup, final_url, scrape_dir)

    # Populate the palette from whichever image exists. Prefer og:image (richer)
    # and fall back to the logo. Any user-provided theme-color still wins.
    palette: dict[str, Optional[str]] = {}
    if og_image_path:
        palette = _extract_palette_from_image(og_image_path)
    if not palette and logo_path:
        palette = _extract_palette_from_image(logo_path)
    for key, value in palette.items():
        if not colors.get(key) and value:
            colors[key] = value

    # Gemini extraction
    llm_result: dict[str, Any] = {}
    try:
        gemini = get_gemini_service()
        prompt = _build_llm_prompt(final_url, meta)
        llm_result = await gemini.generate_structured_json(
            prompt, schema=BRAND_EXTRACTION_SCHEMA, user_id=user_id
        )
    except GeminiError as e:
        logger.warning("brand LLM extraction failed, falling back to raw meta: %s", e)
    except Exception as e:
        logger.exception("brand LLM extraction crashed: %s", e)

    # Merge — LLM takes priority for semantic fields, raw meta fills gaps
    name = (
        llm_result.get("name")
        or meta.get("name_candidate")
        or urlparse(final_url).netloc
    )
    tagline = llm_result.get("tagline") or meta.get("og_title")
    description = llm_result.get("description") or meta.get("description")
    industry = llm_result.get("industry")
    tone_of_voice = llm_result.get("tone_of_voice")
    target_audience = llm_result.get("target_audience")
    guidelines_parts: list[str] = []
    if llm_result.get("guidelines"):
        guidelines_parts.append(llm_result["guidelines"])
    if llm_result.get("key_messages"):
        msgs = "\n".join(f"- {m}" for m in llm_result["key_messages"])
        guidelines_parts.append(f"Key messages:\n{msgs}")
    guidelines = "\n\n".join(guidelines_parts) or None

    return {
        "_scrape_id": scrape_id,
        "name": name,
        "tagline": tagline,
        "description": description,
        "website_url": final_url,
        "logo_path": logo_path,
        "logo_url": get_asset_url(logo_path) if logo_path else None,
        "logo_candidates": logo_candidates,
        "primary_color": colors.get("primary_color"),
        "secondary_color": colors.get("secondary_color"),
        "accent_color": colors.get("accent_color"),
        "fonts": None,
        "tone_of_voice": tone_of_voice,
        "target_audience": target_audience,
        "industry": industry,
        "guidelines": guidelines,
        "extra": {
            "scraped_from": final_url,
            "llm_raw": llm_result,
        },
    }


async def select_scrape_logo_candidate(
    scrape_id: str, candidate_url: str
) -> dict[str, Any]:
    """Download a specific candidate logo into an existing scrape dir.

    Returns {pending_logo_path, logo_url} for the frontend to update the form.
    """
    safe_id = "".join(c for c in scrape_id if c.isalnum() or c in "_-")[:64]
    if not safe_id:
        raise BrandScrapeError("Invalid scrape_id")
    dest_dir = Path(settings.BRANDS_PATH) / f"_scrape_{safe_id}"
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Delete any prior logo files in the scrape dir so we don't collide
    for existing in dest_dir.iterdir():
        if existing.is_file() and existing.name.startswith("logo"):
            try:
                existing.unlink()
            except Exception:
                pass

    logo_path = await _download_logo(candidate_url, dest_dir)
    if not logo_path:
        raise BrandScrapeError(f"Failed to download candidate: {candidate_url}")
    return {
        "pending_logo_path": logo_path,
        "logo_url": get_asset_url(logo_path),
    }
