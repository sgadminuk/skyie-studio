"""Veo 3.1 prompt enhancement via Gemini 2.5 Flash.

Mirrors what the Gemini app does silently before submitting to Veo: take a
brief user prompt and rewrite it to the 5-element Veo template
(Camera + Subject + Action + Setting + Style & Audio), preserving the
caller's intent — including any quoted dialogue and language hints.

Best-effort: if enhancement fails for any reason, return the original prompt.
The caller's generation must never be blocked by this layer.
"""

from __future__ import annotations

import logging

from services.gemini_service import GeminiError, get_gemini_service

logger = logging.getLogger(__name__)

_SCHEMA = {
    "type": "object",
    "properties": {"prompt": {"type": "string"}},
    "required": ["prompt"],
}

_SYSTEM = (
    "You are a Veo 3.1 prompt engineer. Rewrite the user's brief into a single "
    "cinematic prompt using these elements in order: Camera, Subject, Action, "
    "Setting, Style & Audio. "
    "Hard rules: "
    "(1) Preserve every word inside quotation marks verbatim — including the "
    "language and script. Quoted text is dialogue; do not translate, transliterate, "
    "or modify it. "
    "(2) Preserve any explicit voice/accent direction the user wrote. "
    "(3) Keep the rewrite under 600 characters. "
    "(4) Do not invent characters, brands, or settings the user did not imply. "
    "Return JSON: { \"prompt\": \"<rewritten prompt>\" }."
)


async def enhance_veo_prompt(prompt: str, *, user_id: str | None = None) -> str:
    """Expand a brief prompt into a Veo-optimized one. Falls back to input on failure."""
    if not prompt or len(prompt) > 4000:
        return prompt
    try:
        service = get_gemini_service()
        result = await service.generate_structured_json(
            f"{_SYSTEM}\n\nUser brief:\n{prompt}",
            schema=_SCHEMA,
            model="gemini-2.5-flash",
            user_id=user_id,
        )
        out = (result or {}).get("prompt", "").strip()
        return out or prompt
    except GeminiError as e:
        logger.warning("Veo prompt enhancement failed (%s); using original", e)
        return prompt


# ── Avatar pack: generate diverse scene prompts for one reference person ────

_AVATAR_PACK_SCHEMA = {
    "type": "object",
    "properties": {
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "setting": {"type": "string"},
                    "framing": {"type": "string"},
                    "outfit": {"type": "string"},
                    "expression": {"type": "string"},
                    "company": {"type": "string"},
                    "prompt": {"type": "string"},
                },
                "required": ["label", "prompt"],
            },
        },
    },
    "required": ["scenes"],
}

_AVATAR_PACK_SYSTEM = """You are a portrait director generating diverse avatar
scenes for a single reference person. The user will attach one photo of a
real person — every prompt you write composes that same person into a new
scene without describing their face, hair, ethnicity, or body. Nano Banana
will preserve identity from the reference image.

Generate exactly {count} scene prompts covering this matrix of axes — vary
across all of them so no two scenes feel duplicated:

  setting  : LinkedIn-studio, office, café, gym, beach, party, nightclub,
             rooftop bar, traditional cultural setting, outdoor nature,
             street fashion, evening event, casual home, festival
  framing  : close-up portrait, half-body (waist up), full-body
             (mix roughly 1/3 each across the {count})
  outfit   : business formal, smart casual, traditional/cultural attire,
             athletic, evening wear, relaxed casual, fashion-forward
  expression: confident smile, neutral, candid laugh, contemplative,
             focused, joyful, serious
  company  : alone, with one friend, with a small group, with family
             (target ~75% alone, ~25% with others)

Hard rules for every prompt:
  1. Never describe the subject's face, age, ethnicity, hair, eye colour,
     or body type. Refer to them as "the subject" or "the person from the
     reference image" — Nano Banana picks identity off the photo.
  2. Be concrete: lighting, location detail, lens (e.g. 85mm portrait, 35mm
     environmental), pose, mood. 1-3 sentences each.
  3. Keep prompts safe-for-work and respectful — no sexualised framing,
     no minors, no political/religious imagery beyond cultural attire.
  4. The "label" is a 2-4 word title for the UI tile (e.g. "LinkedIn
     headshot", "Beach sunset", "Rooftop party").

Return JSON shaped exactly like:
{{"scenes": [
  {{"label": "...", "setting": "...", "framing": "...", "outfit": "...",
    "expression": "...", "company": "...", "prompt": "..."}},
  ...
]}}"""


async def generate_avatar_pack_prompts(
    *,
    count: int = 30,
    brief: str = "",
    user_id: str | None = None,
) -> list[dict]:
    """Ask Gemini Flash for `count` diverse avatar scene specs.

    Always returns at least one scene — falls back to a static minimal pack
    on transport/parse failure so the workflow never hangs the user.
    """
    if count < 1 or count > 60:
        raise ValueError("count must be between 1 and 60")

    user_section = f"\n\nUser brief (optional steering):\n{brief.strip()}" if brief.strip() else ""
    prompt = _AVATAR_PACK_SYSTEM.format(count=count) + user_section

    try:
        service = get_gemini_service()
        result = await service.generate_structured_json(
            prompt,
            schema=_AVATAR_PACK_SCHEMA,
            model="gemini-2.5-flash",
            user_id=user_id,
        )
        scenes = ((result or {}).get("scenes") or [])
        # Defensive: filter out anything missing the prompt field, trim to count.
        clean = [
            {
                "label": (s.get("label") or "").strip() or f"Scene {i + 1}",
                "setting": (s.get("setting") or "").strip(),
                "framing": (s.get("framing") or "").strip(),
                "outfit": (s.get("outfit") or "").strip(),
                "expression": (s.get("expression") or "").strip(),
                "company": (s.get("company") or "").strip(),
                "prompt": (s.get("prompt") or "").strip(),
            }
            for i, s in enumerate(scenes)
            if (s.get("prompt") or "").strip()
        ][:count]
        if len(clean) < count:
            logger.warning(
                "Avatar pack: Gemini returned %d/%d scenes — padding with fallbacks",
                len(clean), count,
            )
            clean.extend(_avatar_pack_fallback_scenes(count - len(clean), len(clean)))
        return clean
    except GeminiError as e:
        logger.warning("Avatar pack prompt generation failed (%s); using fallback", e)
        return _avatar_pack_fallback_scenes(count, 0)


def _avatar_pack_fallback_scenes(count: int, offset: int) -> list[dict]:
    """Static prompt fallback if Gemini Flash is unavailable."""
    presets = [
        ("LinkedIn headshot", "Studio portrait of the person from the reference image, neutral grey backdrop, soft three-point lighting, confident smile, business formal attire, 85mm portrait lens, sharp eyes, magazine-quality."),
        ("Café morning", "Half-body shot of the subject sipping coffee at a sunlit café, warm window light, candid expression, relaxed smart-casual outfit, shallow depth of field."),
        ("Beach sunset", "Full-body shot of the subject walking along a quiet beach at golden hour, breezy linen outfit, soft side light, joyful relaxed expression, 35mm environmental."),
        ("Rooftop party", "Half-body shot of the subject at a rooftop party, city skyline at dusk, evening wear, fairy lights, candid laugh, ambient bokeh."),
        ("Night club", "Half-body shot of the subject at an upscale nightclub, deep blue and magenta neon, evening outfit, confident pose, cinematic mood."),
        ("Office leadership", "Half-body shot of the subject in a modern glass-walled office, sharp business attire, focused expression, late afternoon light, 50mm lens."),
        ("Gym session", "Full-body shot of the subject mid-workout in a clean modern gym, athletic wear, focused expression, dynamic side light."),
        ("Traditional attire", "Half-body shot of the subject in traditional cultural attire at a festive setting, warm ambient lighting, dignified expression."),
        ("Street fashion", "Full-body shot of the subject on an urban street, fashion-forward outfit, candid stride, overcast soft light, 35mm lens."),
        ("Outdoor nature", "Full-body shot of the subject hiking on a forest trail, rugged casual wear, golden hour, contemplative mood, wide environmental lens."),
        ("Festival group", "Half-body shot of the subject with a small group of friends at a music festival, vibrant ambient light, candid laugh, festival fashion."),
        ("Family portrait", "Half-body shot of the subject with family in a cozy living room, warm tungsten light, joyful expression, traditional setting."),
        ("Evening gala", "Half-body shot of the subject at a black-tie gala, formal evening wear, ambient chandelier light, elegant pose."),
        ("Tech founder", "Studio half-body of the subject in a smart casual outfit against a deep navy backdrop, confident expression, 85mm portrait lens."),
        ("Yoga sunrise", "Full-body shot of the subject in a yoga pose on a wooden deck at sunrise, athletic wear, peaceful mood, soft golden light."),
        ("Rooftop bar", "Half-body shot of the subject at a stylish rooftop bar at twilight, smart casual evening wear, candid smile, neon city bokeh."),
        ("Library study", "Half-body shot of the subject reading at a quiet wood-paneled library, smart casual outfit, contemplative expression, warm window light."),
        ("Bike commute", "Full-body shot of the subject walking next to a bicycle on a tree-lined street, smart casual outfit, relaxed expression, morning light."),
        ("Conference talk", "Half-body shot of the subject delivering a talk on a conference stage, business attire, confident gesture, stage lighting."),
        ("Garden afternoon", "Full-body shot of the subject in a lush garden, breezy casual outfit, candid laugh, dappled afternoon light."),
        ("Coffee meeting", "Half-body shot of the subject in a thoughtful conversation at a café, smart casual outfit, focused expression, soft window light."),
        ("Studio editorial", "Close-up portrait of the subject in editorial fashion lighting, fashion-forward outfit, neutral expression, 100mm macro lens."),
        ("Cooking class", "Half-body shot of the subject cooking in a bright modern kitchen, casual apron over smart casual outfit, focused expression."),
        ("Mountain peak", "Full-body shot of the subject at a windswept mountain peak, technical outdoor gear, joyful expression, dramatic clouds."),
        ("Art gallery", "Half-body shot of the subject in an art gallery contemplating a painting, smart casual outfit, contemplative mood, soft museum light."),
        ("Beach group", "Full-body shot of the subject with a small group of friends on a beach at golden hour, casual beachwear, candid laughter."),
        ("Travel airport", "Half-body shot of the subject at an airport gate window with a carry-on, smart casual travel outfit, anticipatory expression."),
        ("Birthday celebration", "Half-body shot of the subject at a birthday celebration with friends, party outfit, joyful candid expression, warm string lights."),
        ("Outdoor café", "Half-body shot of the subject at an outdoor café terrace, smart casual outfit, relaxed expression, dappled umbrella shade."),
        ("Cultural festival", "Full-body shot of the subject at a vibrant cultural street festival in traditional attire, joyful expression, ambient daylight."),
    ]
    out = []
    for i in range(count):
        label, prompt = presets[(offset + i) % len(presets)]
        out.append({
            "label": label,
            "setting": "",
            "framing": "",
            "outfit": "",
            "expression": "",
            "company": "",
            "prompt": prompt,
        })
    return out
