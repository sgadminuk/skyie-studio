# Skyie Studio — Product Roadmap

**Vision:** The world's most complete AI video production platform — self-hosted, unlimited, and ahead of every market leader.

**Architecture:** Contabo VPS (app) + RunPod GPU on-demand (inference)
**Models:** Self-hosted (no per-inference API costs)

---

## Phase 1 — Shot Creator (Image-to-Video + Stitch)
> **Goal:** The missing core — let users bring their own images and turn them into video

- [ ] New `/create/shots` page
- [ ] Add/remove/reorder shots with drag-and-drop
- [ ] Upload up to 20 source images per shot
- [ ] Text prompt per image (motion/animation direction)
- [ ] Duration control per shot (1-30s)
- [ ] Wan 2.2 I2V animates each image into a clip
- [ ] FFmpeg stitches all clips into a final video
- [ ] Transition options between shots (cut, crossfade, dissolve)
- [ ] Background music generation option
- [ ] Preview thumbnails from uploaded images

**Models:** Wan 2.2 I2V-A14B, MusicGen
**Competes with:** Runway Image-to-Video, Kling Image-to-Video, Pika Image-to-Video

---

## Phase 2 — Image Preprocessing Pipeline
> **Goal:** Clean and transform source images before video generation

- [ ] Watermark detection and removal (Florence-2 + LaMa inpainting)
- [ ] Aspect ratio picker: 16:9, 9:16, 1:1, 4:5, 2.39:1 (cinematic)
- [ ] Smart crop (content-aware center detection)
- [ ] Smart fill/outpaint (extend canvas to fit target ratio using FLUX)
- [ ] Batch processing — apply to all images in a shot
- [ ] Before/after preview
- [ ] Auto-enhance (brightness, contrast, sharpness)

**Models:** Florence-2 (detection), LaMa (inpainting), FLUX.1 (outpaint fill)
**Competes with:** No competitor does this natively — unique advantage

---

## Phase 3 — Camera Controls & Motion
> **Goal:** Cinematic camera control that rivals Runway Gen-3 and Kling

- [ ] Camera motion presets per shot:
  - Pan (left/right), Tilt (up/down)
  - Zoom (in/out), Dolly (push/pull)
  - Orbit (rotate around subject)
  - Crane (vertical sweep)
  - Tracking shot (follow subject)
  - Handheld/shake
- [ ] Custom camera path editor (keyframe-based)
- [ ] Motion intensity slider (subtle → dramatic)
- [ ] Motion Brush — paint on the image where motion should happen
  - Brush size, direction arrows, intensity
  - Static mask (areas that should NOT move)
- [ ] Subject-aware motion (detect subject, apply motion around it)
- [ ] Camera + subject motion combined (e.g., zoom in while subject walks)

**Models:** Wan 2.2 with ControlNet-style conditioning, custom motion embeddings
**Competes with:** Runway Motion Brush, Kling Camera Controls, Pika Motion

---

## Phase 4 — Video-to-Video & Video Extend
> **Goal:** Transform and extend existing videos — the #1 requested feature

### Video-to-Video
- [ ] Upload source video + text prompt → transformed video
- [ ] Style transfer (e.g., "make this look like anime")
- [ ] Character/object replacement via prompt
- [ ] Scene relighting (change time of day, weather)
- [ ] Strength slider (how much to transform)
- [ ] Frame-by-frame consistency (temporal coherence)

### Video Extend
- [ ] Extend any generated or uploaded video forward/backward
- [ ] Auto-continue motion and scene context
- [ ] Loop generation (seamless loops for backgrounds)
- [ ] Extend with prompt change (scene continues but evolves)
- [ ] Chain extends to build long-form content (30s → 60s → 2min)

### Reverse & Speed
- [ ] Reverse video
- [ ] Speed ramp (slow-mo ↔ fast-forward)
- [ ] Frame interpolation for smooth slow-motion (RIFE/FILM)

**Models:** Wan 2.2 with video conditioning, RIFE (frame interpolation)
**Competes with:** Runway Gen-3 Video-to-Video, Kling Video Extend, Pika Add/Modify

---

## Phase 5 — Upscaling & Enhancement
> **Goal:** 4K output quality that no competitor matches

- [ ] Video upscaling: 720p → 1080p → 4K (Real-ESRGAN / SUPIR)
- [ ] Face enhancement in video (GFPGAN / CodeFormer)
- [ ] Denoising & artifact removal
- [ ] Frame interpolation: 24fps → 48fps → 60fps
- [ ] HDR tone mapping
- [ ] Detail enhancement (textures, edges)
- [ ] Batch upscale for all clips before final stitch
- [ ] Quality presets: Draft (fast) → Standard → Ultra (slow, max quality)

**Models:** Real-ESRGAN, SUPIR, GFPGAN, CodeFormer, RIFE
**Competes with:** Topaz Video AI, Runway Upscale — but integrated into the pipeline

---

## Phase 6 — Advanced Editing Suite
> **Goal:** In-browser video editor that eliminates the need for Premiere/DaVinci

### Inpainting & Object Control
- [ ] Video inpainting — remove objects/people from video
- [ ] Object replacement — select object → replace with prompt
- [ ] Background removal (video) — transparent/green screen output
- [ ] Background replacement — swap background via prompt
- [ ] Segmentation masks (SAM2) — click to select any object

### Timeline Editor
- [ ] Multi-track timeline (video, audio, captions, effects)
- [ ] Drag-and-drop clip arrangement
- [ ] Trim, split, merge clips
- [ ] Transition library (50+ transitions)
- [ ] Keyframe animation for effects
- [ ] Picture-in-picture
- [ ] Ken Burns effect on images
- [ ] Color grading / LUT support

### Text & Graphics
- [ ] Animated text overlays (lower thirds, titles)
- [ ] Logo/watermark placement
- [ ] Kinetic typography
- [ ] Auto-generated thumbnails
- [ ] Subtitle styling (font, position, animation)

**Models:** SAM2 (segmentation), ProPainter (video inpainting)
**Competes with:** CapCut, Premiere Pro, DaVinci Resolve — but AI-native

---

## Phase 7 — Advanced Audio Production
> **Goal:** Full audio studio — no external tools needed

### Voice & Dialogue
- [ ] Multi-character dialogue (assign different voices to characters)
- [ ] Emotion control (happy, sad, angry, whispering, shouting)
- [ ] Voice-to-voice conversion (change speaker identity)
- [ ] Real-time voice preview before generation
- [ ] Pronunciation editor (phoneme-level control)
- [ ] 50+ languages (expand from current 7)

### Sound Design
- [ ] AI sound effects generation (AudioLDM2 / Stable Audio)
  - "car horn honking", "rain on window", "crowd cheering"
- [ ] Automatic SFX placement (detect scene → add matching sounds)
- [ ] Foley generation synced to video motion
- [ ] Audio ducking (auto-lower music during speech)
- [ ] Audio mixing console (per-track volume, EQ, effects)
- [ ] Ambient sound beds (office, nature, city, space)

### Music
- [ ] Longer music generation (current MusicGen: ~30s → target: 3-5min)
- [ ] Music style transfer (upload reference → generate similar)
- [ ] Stems separation (isolate vocals, drums, bass, melody)
- [ ] Beat-sync video cuts to music
- [ ] Royalty-free music library integration

**Models:** AudioLDM2, Stable Audio, Demucs (stem separation), extended MusicGen
**Competes with:** ElevenLabs (voice), Suno (music), Epidemic Sound — all in one

---

## Phase 8 — AI Director & Auto-Production
> **Goal:** One prompt → complete video. Zero manual work.

- [ ] AI Director mode:
  - User provides: topic/idea (one sentence)
  - AI generates: script, scene breakdown, shot list, visuals, voice, music, captions
  - Produces: finished video ready to post
- [ ] Smart script writer (Claude/GPT → structured script with [TALKING]/[BROLL] markers)
- [ ] Auto scene detection from script (identify visual scenes, camera angles)
- [ ] Auto image sourcing (search + download reference images from web)
- [ ] Auto voice casting (match voice to content type)
- [ ] Auto music scoring (analyze mood → generate matching music)
- [ ] Auto caption styling (match brand/theme)
- [ ] Template system:
  - YouTube explainer, TikTok hook, Product demo, News report
  - Tutorial, Testimonial, Promo, Trailer
- [ ] Brand kit (colors, fonts, logos, intro/outro, watermark)
- [ ] Batch generation (generate 10 variations from one brief)

**Models:** Claude/GPT for scripting, all existing models orchestrated
**Competes with:** Synthesia, HeyGen, InVideo AI — but fully self-hosted and unlimited

---

## Phase 9 — Real-Time & Interactive
> **Goal:** Live generation and interactive control

- [ ] Real-time preview during generation (stream frames as they render)
- [ ] Interactive generation:
  - Pause mid-generation → adjust prompt → continue
  - Regenerate single shot without re-doing entire video
  - A/B comparison (generate 2 versions side by side)
- [ ] Live streaming integration:
  - Generate AI visuals live during stream
  - Real-time avatar (webcam → AI avatar with lip-sync)
  - Live background replacement
- [ ] API access:
  - REST API for all generation features
  - Webhook callbacks on job completion
  - Bulk/batch API for programmatic generation
  - SDK (Python, Node.js)

**Competes with:** D-ID Live, HeyGen Streaming Avatar — but self-hosted

---

## Phase 10 — 3D, Spatial & Next-Gen
> **Goal:** Future-proof — what nobody else has yet

- [ ] Image/Video to 3D (generate 3D scenes from images)
- [ ] 3D camera paths through generated scenes
- [ ] Spatial video output (Apple Vision Pro / Meta Quest format)
- [ ] Consistent character across shots (character identity preservation)
  - Upload character reference → same person appears in every scene
  - IP-Adapter / InstantID integration
- [ ] Multi-shot consistency (scene/environment stays coherent)
- [ ] World building — define a setting once, generate many scenes in it
- [ ] AI stunt doubles — put any face on any body in any scene
- [ ] Physics-aware generation (realistic object interaction)
- [ ] Long-form generation (5-10 minute videos in one go)

**Models:** InstantMesh/TripoSR (3D), IP-Adapter (character consistency), InstantID
**Competes with:** Nothing — this is ahead of market

---

## Feature Matrix: Skyie Studio vs Market (Post-Roadmap)

| Capability | Runway | Kling | Pika | HeyGen | Synthesia | **Skyie Studio** |
|------------|--------|-------|------|--------|-----------|-----------------|
| Text-to-Video | Yes | Yes | Yes | No | No | **Yes** |
| Image-to-Video | Yes | Yes | Yes | No | No | **Yes (P1)** |
| Video-to-Video | Yes | Yes | Yes | No | No | **Yes (P4)** |
| Video Extend | Yes | Yes | Yes | No | No | **Yes (P4)** |
| Camera Controls | Yes | Yes | Yes | No | No | **Yes (P3)** |
| Motion Brush | Yes | No | Yes | No | No | **Yes (P3)** |
| Upscaling to 4K | Yes | Yes | No | No | No | **Yes (P5)** |
| TTS / Voice Clone | No | No | No | Yes | Yes | **Yes** |
| Lip Sync Avatar | No | No | No | Yes | Yes | **Yes** |
| Music Generation | No | No | No | No | No | **Yes** |
| Sound Effects AI | No | No | No | No | No | **Yes (P7)** |
| Auto Captions | No | No | No | Yes | Yes | **Yes** |
| Script-to-Video | No | No | No | Partial | Partial | **Yes** |
| One-Prompt Director | No | No | No | No | No | **Yes (P8)** |
| Video Inpainting | Yes | No | Yes | No | No | **Yes (P6)** |
| Background Removal | Yes | No | Yes | Yes | No | **Yes (P6)** |
| Timeline Editor | No | No | No | No | No | **Yes (P6)** |
| Multi-format Export | No | No | No | Yes | Yes | **Yes** |
| Watermark Removal | No | No | No | No | No | **Yes (P2)** |
| Character Consistency | No | Partial | No | Yes | Yes | **Yes (P10)** |
| Self-hosted/Unlimited | No | No | No | No | No | **Yes** |
| 3D/Spatial Video | No | No | No | No | No | **Yes (P10)** |
| Real-time Avatar | No | No | No | Yes | No | **Yes (P9)** |
| API/SDK | Yes | Yes | Yes | Yes | Yes | **Yes (P9)** |
| AI Sound Design | No | No | No | No | No | **Yes (P7)** |
| Batch Generation | No | No | No | Yes | Yes | **Yes (P8)** |

---

## Unique Advantages (No Competitor Has All of These)

1. **Fully self-hosted** — zero per-generation API costs
2. **End-to-end pipeline** — script → voice → video → music → captions → export
3. **AI Director** — one sentence → finished video
4. **Integrated audio studio** — TTS + music + SFX + mixing in one place
5. **Image preprocessing** — watermark removal + smart aspect ratio (unique)
6. **Unlimited generations** — pay for GPU time, not per video
7. **Open model ecosystem** — swap in better models as they release

---

## Priority Order

| Priority | Phase | Impact | Effort |
|----------|-------|--------|--------|
| Now | P1 — Shot Creator | High | Medium |
| Next | P2 — Image Preprocessing | Medium | Low |
| High | P3 — Camera Controls | Very High | High |
| High | P4 — V2V + Extend | Very High | High |
| High | P5 — Upscaling | High | Medium |
| Medium | P8 — AI Director | Very High | Very High |
| Medium | P6 — Editing Suite | High | Very High |
| Medium | P7 — Audio Production | High | High |
| Later | P9 — Real-Time | Medium | High |
| Future | P10 — 3D/Spatial | High | Very High |
