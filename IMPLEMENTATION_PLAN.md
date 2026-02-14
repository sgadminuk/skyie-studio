# Skyie Studio — Phased Implementation Plan

**Date:** February 2026
**Architecture:** Contabo VPS (application) + RunPod GPU (inference only)

---

## Market Context

### Industry Landscape (Feb 2026)

| Platform | Focus | Pricing | Key Differentiator |
|----------|-------|---------|-------------------|
| **Runway** (Gen-4) | Creative video | $12–$76/mo | Best-in-class quality, 30+ AI tools, timeline editor |
| **Pika** (2.5) | Creative video | $10–$95/mo | Physics-based interaction, auto sound effects, lip-sync |
| **Kling** (2.6) | Creative video | Free–$92/mo | 66 free daily credits, simultaneous audio+video gen |
| **Synthesia** | Enterprise avatar | $18–$89/mo | 160+ languages, Fortune 100 trust, compliance |
| **HeyGen** | Avatar/talking head | $24–$225/mo | Avatar IV ultra-realism, real-time translation |
| **Luma AI** (Ray3) | Creative video | $8–$66/mo | Best I2V, 3D physics understanding |
| **Sora 2** | Premium video | ChatGPT Plus | Cinematic quality, Disney partnership |
| **Hailuo** (2.3) | Value video | $15–$120/mo | Best value, anime/illustration styles |

**Market Size:** $4.5B (2025) → projected $42B by 2033 (32% CAGR)

### Table Stakes (Must Have)
- Text-to-Video generation
- Image-to-Video animation
- Credit-based pricing with free tier
- No-watermark on paid plans
- Real-time generation progress
- Multi-format export (TikTok, YouTube, Instagram)

### Differentiators (Skyie Studio's Edge)
- **Full production workflow** — Script-to-finished-video pipeline (talking head + B-roll + music + captions in one flow)
- **Self-hosted models** — No per-inference API costs, predictable pricing
- **All-in-one** — Video, TTS, lip-sync, music, captions under one roof
- **Voice cloning** — Zero-shot voice clone with Fish Speech / CosyVoice
- **Multi-format export** — Platform-optimized exports in one click

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CONTABO VPS (149.102.133.33) — Always On                   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Next.js 14   │  │  FastAPI      │  │  PostgreSQL      │   │
│  │  Frontend     │  │  Backend      │  │  User/Job data   │   │
│  │  Port 3000    │  │  Port 8000    │  │  Port 5432       │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────┘   │
│         │                  │                                  │
│         │         ┌────────┴────────┐                        │
│         │         │  Redis           │                        │
│         │         │  Job Queue +     │                        │
│         │         │  Pub/Sub         │                        │
│         │         │  Port 6379       │                        │
│         │         └────────┬────────┘                        │
│         │                  │                                  │
│         │         ┌────────┴────────┐                        │
│         │         │  Celery Worker   │                        │
│         │         │  Orchestration   │                        │
│         │         │  FFmpeg/Storage  │                        │
│         └─────────┴────────┬────────┘                        │
│                            │                                  │
│  Traefik ─── Let's Encrypt ─── studio.skyie.tech             │
└────────────────────────────┼─────────────────────────────────┘
                             │ HTTPS (only when needed)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  RUNPOD GPU (RTX 5090) — On-Demand Only                     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  GPU Inference API (FastAPI)                          │   │
│  │  - /infer/video    (Wan 2.2)                          │   │
│  │  - /infer/tts      (Fish Speech / CosyVoice)         │   │
│  │  - /infer/animate  (LivePortrait)                     │   │
│  │  - /infer/music    (MusicGen)                         │   │
│  │  - /infer/caption  (Whisper)                          │   │
│  │  - /health                                            │   │
│  └──────────────────────────────────────────────────────┘   │
│  Models: 435 GB in /workspace/models                         │
│  FLUX: HuggingFace Inference API (no local GPU needed)       │
└─────────────────────────────────────────────────────────────┘
```

### Key Principle: VPS Does Everything, GPU Only Infers

| Task | Where | Why |
|------|-------|-----|
| API routing, auth, job queue | VPS | Always-on, no GPU needed |
| File upload/storage | VPS | Disk I/O, no GPU needed |
| FFmpeg processing (stitch, encode, watermark, export) | VPS | CPU-only, no GPU needed |
| Caption SRT generation from text | VPS | String processing |
| Prompt enhancement | VPS | LLM API call |
| Video generation (Wan 2.2) | GPU | Model inference |
| Image generation (FLUX) | HF API | External API |
| TTS audio (Fish Speech / CosyVoice) | GPU | Model inference |
| Face animation (LivePortrait) | GPU | Model inference |
| Music generation (MusicGen) | GPU | Model inference |
| Speech-to-text (Whisper) | GPU | Model inference |

---

## Phase 1 — Foundation (Week 1–2)
**Goal: Dockerized VPS deployment with working mock mode end-to-end**

### 1.1 Docker & Deployment Setup
- [ ] Create `docker-compose.yml` for Contabo with all services:
  - `skyie-studio-frontend` (Next.js)
  - `skyie-studio-backend` (FastAPI + Celery worker)
  - `skyie-studio-redis` (Redis 7)
  - `skyie-studio-postgres` (PostgreSQL 16)
- [ ] Add Traefik labels for reverse proxy routing
  - Frontend: `studio.skyie.tech`
  - API: `studio-api.skyie.tech`
- [ ] Create Dockerfiles for frontend and backend
- [ ] Add health checks to all containers
- [ ] Configure `.env` files for production

### 1.2 Database Setup (PostgreSQL)
- [ ] User model (id, email, name, avatar, plan, credits, created_at)
- [ ] Job model (id, user_id, workflow, status, progress, step, params, output_path, error, timestamps)
- [ ] Asset model (id, user_id, type, filename, path, size, metadata, created_at)
- [ ] Usage model (id, user_id, job_id, credits_used, gpu_seconds, created_at)
- [ ] SQLAlchemy/Alembic migrations

### 1.3 Backend Adjustments for VPS
- [ ] Replace Redis-only job storage with PostgreSQL (Redis still for queue + pub/sub)
- [ ] Add database session management
- [ ] Update storage service for Docker volume paths
- [ ] Verify all existing API routes work in Docker
- [ ] Test full mock mode workflow end-to-end in container

### 1.4 Frontend — Core Layout & Navigation
- [ ] Install dependencies: shadcn/ui, Tailwind, Lucide icons, Zustand, axios
- [ ] App shell: sidebar nav + top bar + main content area
- [ ] Pages structure:
  - `/` — Dashboard (recent generations)
  - `/create` — Generation wizard
  - `/create/talking-head` — Talking head form
  - `/create/broll` — B-roll form
  - `/create/production` — Full production form
  - `/library` — Asset library (videos, avatars, voices)
  - `/settings` — Account settings
- [ ] API client layer (`lib/api.ts`) with axios instance
- [ ] Base responsive layout (mobile + desktop)

**Deliverable:** App runs on VPS via Docker, accessible at studio.skyie.tech, full mock workflow works.

---

## Phase 2 — Frontend Core UI (Week 3–4)
**Goal: All generation forms, job monitoring, and asset management working in mock mode**

### 2.1 Dashboard Page
- [ ] Job list with status badges (queued, processing, completed, failed)
- [ ] Grid/list view toggle for generated videos
- [ ] Thumbnail display for completed videos
- [ ] Quick actions: view, download, delete, re-generate
- [ ] Empty state for new users

### 2.2 Generation Forms
- [ ] **Talking Head Form:**
  - Script textarea with character counter
  - Avatar upload/select (drag-and-drop + gallery)
  - Voice engine selector (Fish Speech / CosyVoice)
  - Voice reference upload for cloning
  - Language selector
  - Background toggle + prompt
  - Generate button with credit cost preview
- [ ] **B-Roll Form:**
  - Scene list with add/remove/reorder
  - Per-scene: prompt textarea + duration slider
  - Style prompt input
  - Music toggle + prompt
  - Resolution selector
- [ ] **Full Production Form:**
  - Script editor with `[TALKING]` / `[BROLL:]` markers
  - Syntax highlighting for markers
  - Combined settings (avatar, voice, music, background)
  - Script preview/validation

### 2.3 Job Progress Monitoring
- [ ] WebSocket connection for real-time updates
- [ ] Multi-phase progress bar with step labels
- [ ] Estimated time remaining
- [ ] Queue position indicator
- [ ] Auto-redirect to result when complete
- [ ] Notification when generation finishes (if user navigated away)

### 2.4 Asset Library
- [ ] **Videos tab:** Grid of generated videos with thumbnails, metadata, download
- [ ] **Avatars tab:** Upload, preview, delete avatar images
- [ ] **Voices tab:** Built-in voices list + upload voice reference
- [ ] Video player modal (HTML5 video with basic controls)
- [ ] Multi-format export dialog (TikTok, YouTube, Instagram, Twitter)

### 2.5 Responsive Design
- [ ] Mobile-first generation forms
- [ ] Touch-friendly interactions
- [ ] Collapsible sidebar on mobile

**Deliverable:** Complete UI working end-to-end with mock backend. User can create all 3 generation types, monitor progress, view results, manage assets.

---

## Phase 3 — GPU Inference API (Week 5–6)
**Goal: Lightweight FastAPI on RunPod that serves model inference via HTTP**

### 3.1 GPU Server Inference API
- [ ] FastAPI app at `/workspace/inference/server.py`
- [ ] Endpoints:
  ```
  POST /infer/t2v         — Text-to-Video (Wan 2.2 T2V-A14B)
  POST /infer/i2v         — Image-to-Video (Wan 2.2 I2V-A14B)
  POST /infer/ti2v        — Text+Image-to-Video (Wan 2.2 TI2V-5B)
  POST /infer/animate     — Character Animation (Wan 2.2 Animate-14B)
  POST /infer/s2v         — Speech-to-Video (Wan 2.2 S2V-14B)
  POST /infer/tts         — Text-to-Speech (Fish Speech / CosyVoice)
  POST /infer/lipsync     — Face Animation (LivePortrait)
  POST /infer/music       — Music Generation (MusicGen)
  POST /infer/caption     — Speech-to-Text (Whisper)
  GET  /health            — GPU status + loaded models
  ```
- [ ] API key authentication (shared secret between VPS and GPU)
- [ ] VRAM-aware model loading (load on demand, unload after idle timeout)
- [ ] Input/output via presigned URLs or base64 (files stay on VPS storage)
- [ ] Request timeout handling for long generations

### 3.2 Model Loading Implementation
- [ ] Wan 2.2 pipeline with diffusers library
- [ ] Fish Speech / CosyVoice inference wrappers
- [ ] LivePortrait inference pipeline
- [ ] MusicGen inference with transformers
- [ ] Whisper transcription pipeline
- [ ] FLUX via HuggingFace Inference API (no local model)

### 3.3 VPS Backend — Connect to GPU
- [ ] GPU client service (`services/gpu_client.py`) on VPS backend
  - HTTP client to call GPU inference API
  - File transfer: upload input files, download results
  - Retry logic + timeout handling
  - GPU health check (is server up?)
- [ ] Update model wrappers to call GPU client instead of `NotImplementedError`
- [ ] GPU availability indicator in frontend (online/offline badge)
- [ ] Graceful degradation: if GPU offline, show "Generation unavailable" instead of crashing

### 3.4 File Transfer Strategy
```
VPS → GPU:  Upload input files (avatar image, voice reference, audio)
            via HTTP POST to GPU server /upload endpoint
GPU → VPS:  GPU saves output to temp, VPS downloads via /download endpoint
            OR: GPU uploads to shared MinIO/S3 bucket
```
- [ ] Implement file transfer service
- [ ] Cleanup temp files on GPU after VPS downloads result

**Deliverable:** GPU server serves real model inference. VPS backend calls GPU only for AI tasks. One full talking-head video generates with real models.

---

## Phase 4 — Real Workflow Integration (Week 7–8)
**Goal: All 3 workflows produce real AI-generated output**

### 4.1 Talking Head Workflow — Real Mode
- [ ] TTS: VPS sends script → GPU runs Fish Speech → VPS receives audio
- [ ] Face animation: VPS sends avatar + audio → GPU runs LivePortrait → VPS receives video
- [ ] Background: VPS sends prompt → HF API runs FLUX → VPS receives image
- [ ] Compositing: VPS runs FFmpeg (face video + background)
- [ ] Captions: VPS sends audio → GPU runs Whisper → VPS receives SRT
- [ ] Final encode: VPS runs FFmpeg (composite + captions)

### 4.2 B-Roll Workflow — Real Mode
- [ ] Key frames: VPS sends prompts → HF API runs FLUX → VPS receives images
- [ ] Animation: VPS sends images → GPU runs Wan 2.2 I2V → VPS receives clips
- [ ] Stitching: VPS runs FFmpeg (crossfade transitions)
- [ ] Music: VPS sends prompt → GPU runs MusicGen → VPS receives audio
- [ ] Final mix: VPS runs FFmpeg (video + music)

### 4.3 Full Production Workflow — Real Mode
- [ ] Script parsing on VPS (extract TALKING / BROLL segments)
- [ ] Process each segment (talking head or b-roll sub-workflow)
- [ ] Stitch all segments on VPS via FFmpeg
- [ ] Generate full-video captions via GPU Whisper
- [ ] Add background music via GPU MusicGen
- [ ] Final export via FFmpeg on VPS

### 4.4 Quality & Performance
- [ ] Tune Wan 2.2 generation parameters (steps, guidance scale, resolution)
- [ ] Test with various prompt styles
- [ ] Optimize file transfer between VPS ↔ GPU
- [ ] Add generation parameter presets (Fast/Balanced/Quality)

**Deliverable:** All 3 workflows produce real AI-generated videos. GPU spins up only during generation, all other processing on VPS.

---

## Phase 5 — Auth, Billing & Polish (Week 9–10)
**Goal: User accounts, credit system, production-ready polish**

### 5.1 Authentication
- [ ] JWT-based auth (or integrate with Skyie Tech SSO if available)
- [ ] Login / Register pages
- [ ] Protected API routes
- [ ] User session management
- [ ] Password reset flow

### 5.2 Credit System
- [ ] Credit cost calculator per generation type:
  - Talking Head: 10–30 credits (based on script length)
  - B-Roll: 5–15 credits per scene
  - Full Production: 20–100 credits (based on segment count)
- [ ] Credit check before job submission
- [ ] Credit deduction on job completion (not submission)
- [ ] Credit balance display in UI
- [ ] Usage history page

### 5.3 Pricing Tiers
```
Free:       50 credits/month, watermarked, 720p max
Starter:    500 credits/month, no watermark, 1080p — $12/mo
Pro:        2000 credits/month, priority queue, 1080p — $29/mo
Business:   5000 credits/month, API access, 4K — $79/mo
```
- [ ] Stripe Checkout integration
- [ ] Subscription management (upgrade/downgrade/cancel)
- [ ] Webhook handlers for payment events
- [ ] Free tier watermark via FFmpeg

### 5.4 Production Polish
- [ ] Error handling and user-friendly error messages
- [ ] Loading states and skeleton screens
- [ ] Toast notifications for actions
- [ ] Dark mode (match Skyie Tech brand)
- [ ] SEO meta tags and OG images
- [ ] Rate limiting on API endpoints
- [ ] Input validation and sanitization

**Deliverable:** Multi-tenant SaaS with user accounts, credit-based billing, and Stripe integration.

---

## Phase 6 — Advanced Features (Week 11–12+)
**Goal: Differentiating features beyond MVP**

### 6.1 Prompt Enhancement
- [ ] LLM-powered prompt improvement (Claude Haiku or GPT-4o-mini)
- [ ] Style presets: Cinematic, Anime, Documentary, Social Media
- [ ] Prompt history and favorites

### 6.2 Storyboard Editor
- [ ] Visual card-based scene editor for B-roll
- [ ] Drag-and-drop reordering
- [ ] Scene-level preview thumbnails
- [ ] Transition selector between scenes

### 6.3 Project Management
- [ ] Save generation as project
- [ ] Duplicate and iterate on projects
- [ ] Project templates (marketing video, explainer, social post)

### 6.4 Advanced Export
- [ ] Animated thumbnail/preview generation
- [ ] Direct share to TikTok/YouTube (OAuth integration)
- [ ] Batch export multiple formats

### 6.5 API Access (Business Tier)
- [ ] REST API with API key authentication
- [ ] API documentation (Swagger/OpenAPI auto-generated)
- [ ] Webhook callbacks for job completion
- [ ] Rate limiting per API key

### 6.6 Analytics Dashboard (Admin)
- [ ] Total generations, GPU hours, revenue
- [ ] Per-user usage tracking
- [ ] GPU cost vs revenue metrics
- [ ] Popular prompts and workflows

---

## Tech Stack Summary

### Contabo VPS (Application)
| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui |
| Backend API | FastAPI (Python), Uvicorn |
| Job Queue | Celery + Redis |
| Database | PostgreSQL 16 |
| Cache/Pub-Sub | Redis 7 |
| Video Processing | FFmpeg 6.x |
| Reverse Proxy | Traefik (existing Skyie Proxy network) |
| SSL | Let's Encrypt (via Traefik) |
| Containerization | Docker Compose |

### RunPod GPU (Inference Only)
| Component | Technology |
|-----------|-----------|
| Inference API | FastAPI (Python), Uvicorn |
| ML Framework | PyTorch 2.8, Diffusers, Transformers |
| Models | Wan 2.2, LivePortrait, Fish Speech, CosyVoice, MusicGen, Whisper |
| Image Gen | FLUX.1 Schnell via HuggingFace API (no local GPU) |

### External Services
| Service | Purpose |
|---------|---------|
| Stripe | Payment processing |
| HuggingFace API | FLUX image generation |
| Let's Encrypt | SSL certificates |
| MinIO (optional) | Shared file storage between VPS ↔ GPU |

---

## GPU Cost Optimization Strategy

1. **Start GPU only when jobs are queued** — RunPod API to start/stop pod programmatically
2. **Batch inference** — Queue multiple jobs, start GPU, process batch, shut down
3. **Idle timeout** — Auto-stop GPU pod after 10 min of no jobs
4. **Model loading order** — Load heaviest model first, process all its jobs, then swap
5. **FLUX via API** — Image generation doesn't need GPU at all
6. **FFmpeg on VPS** — All video compositing, encoding, export runs on VPS CPU
7. **Estimated GPU cost:** ~$0.50–$1.00 per hour (RTX 5090), optimized for <$100/month at moderate usage

---

## File Structure

```
/opt/skyie-studio/                    # Contabo VPS
├── docker-compose.yml
├── .env
├── frontend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── app/                      # Next.js pages
│   │   ├── components/               # UI components
│   │   ├── lib/                      # API client, utils
│   │   └── hooks/                    # Custom React hooks
│   └── package.json
├── backend/
│   ├── Dockerfile
│   ├── main.py
│   ├── config.py
│   ├── api/                          # Route handlers
│   ├── models/                       # Model wrappers (call GPU client)
│   ├── services/                     # Business logic
│   ├── workflows/                    # Orchestration
│   ├── db/                           # SQLAlchemy models + migrations
│   └── utils/
├── redis/
├── postgres/
│   └── init.sql
└── nginx/

/workspace/                           # RunPod GPU
├── inference/
│   ├── server.py                     # FastAPI inference server
│   ├── pipelines/                    # Model loading + inference
│   └── requirements.txt
├── models/                           # 435 GB downloaded models
├── config/
│   ├── startup.sh
│   └── .env
└── logs/
```

---

## Priority Order

If time is limited, build in this exact order:

1. **Phase 1.4** → Frontend core layout (visible progress)
2. **Phase 1.1** → Docker deployment (accessible online)
3. **Phase 2.2** → Generation forms (core product)
4. **Phase 2.3** → Job progress monitoring (essential UX)
5. **Phase 3.1** → GPU inference API (real output)
6. **Phase 4.1** → Talking head workflow real mode (hero feature)
7. **Phase 5.1** → Auth (multi-tenant)
8. **Phase 5.3** → Billing (revenue)

Everything else is enhancement on top of these.
