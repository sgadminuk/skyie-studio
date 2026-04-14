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

        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"logo{ext}"
        dest.write_bytes(raw)
        return str(dest)
    except Exception as e:
        logger.warning("brand logo download failed for %s: %s", logo_url, e)
        return None


def _pick_logo_candidates(soup: BeautifulSoup, base_url: str) -> list[str]:
    """Return logo URL candidates ordered best → worst."""
    candidates: list[tuple[int, str]] = []

    def add(score: int, value: Optional[str]):
        if value:
            candidates.append((score, urljoin(base_url, value)))

    # Highest: explicit logo images inside <header>
    header = soup.find("header") or soup
    for img in header.find_all("img", limit=20):
        alt = (img.get("alt") or "").lower()
        cls = " ".join(img.get("class") or []).lower()
        src = img.get("src") or img.get("data-src")
        if not src:
            continue
        if "logo" in alt or "logo" in cls or "logo" in src.lower():
            add(100, src)
        else:
            add(40, src)

    # Apple touch icon — usually a solid logo
    for link in soup.find_all("link", rel=True):
        rel = " ".join(link.get("rel") or []).lower()
        href = link.get("href")
        if not href:
            continue
        if "apple-touch-icon" in rel:
            add(90, href)
        elif "mask-icon" in rel:
            add(80, href)
        elif "icon" in rel and "shortcut" not in rel:
            add(60, href)
        elif "shortcut icon" in rel:
            add(50, href)

    # OpenGraph image (often a banner, not a logo — still useful fallback)
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        add(30, og["content"])

    # Dedupe while preserving order
    candidates.sort(key=lambda p: p[0], reverse=True)
    seen: set[str] = set()
    out: list[str] = []
    for _, url in candidates:
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out[:10]


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
        "secondary_color": None,
        "accent_color": None,
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
