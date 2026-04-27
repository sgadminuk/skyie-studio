# Skyie Studio — System architecture

> Snapshot date: **2026-04-27**.
> Diagrams reflect what's actually in the repo (`docker-compose.yml`,
> `backend/`, `frontend/`, `marketing/`, `gpu-server/`) — not aspiration.

---

## 1 · High-level topology

```
                                                          ┌───────────────────────────────┐
                                                          │   END-USER BROWSERS           │
                                                          │   desktop · mobile · tablet   │
                                                          └──────────────┬────────────────┘
                                                                         │ HTTPS
                                                                         ▼
                              ┌──────────────────────────────────────────────────────────────────┐
                              │                  DNS · skyie.studio (Cloudflare?)                │
                              │                                                                  │
                              │   skyie.studio          →  Edge (Vercel) → marketing/             │
                              │   app.skyie.studio      →  Contabo VPS · Traefik → frontend      │
                              │   api.skyie.studio      →  Contabo VPS · Traefik → backend       │
                              │                                                                  │
                              │   docker-compose.yml frontend label is now Host=app.skyie.studio │
                              │   (rewired 2026-04-27). See DEPLOYMENT.md for the cutover plan.  │
                              └────────────────────────────┬─────────────────────────────────────┘
                                                           │
              ┌────────────────────────────────────────────┼────────────────────────────────────────────┐
              │                                            │                                            │
              ▼                                            ▼                                            ▼

      ┌──────────────────┐            ┌──────────────────────────────────────────────────┐    ┌───────────────────────┐
      │  EDGE (TBD)      │            │       CONTABO VPS  · docker-compose.yml          │    │  RUNPOD GPU POD       │
      │                  │            │       network: SkyieProxy (external)              │    │  (separate machine)   │
      │  marketing/      │            │                                                   │    │                       │
      │  · Next 16       │            │   ┌─────────────────────────────────────────┐    │    │  gpu-server/          │
      │  · React 19      │            │   │  Traefik (LB + auto-TLS via Let's       │    │    │  · FastAPI 0.115      │
      │  · Tailwind 4    │            │   │  Encrypt) — outside compose, on the     │    │    │  · torch 2.5+         │
      │  · static / SSR  │            │   │  SkyieProxy network                     │    │    │  · diffusers 0.31+    │
      │                  │            │   └────────────┬────────────────────────────┘    │    │  · transformers 4.46+ │
      │  Routes:         │            │                │                                  │    │  · accelerate 1.1+    │
      │   /              │            │                │ HTTP                             │    │                       │
      │   /system        │            │   ┌────────────▼─────────┐  ┌──────────────────┐ │    │  Models:              │
      │   /work          │            │   │  frontend            │  │  backend         │ │    │  · flux_image         │
      │   /access        │            │   │  · Next 14.2         │  │  · FastAPI 0.115 │ │    │  · wan_video          │
      │   /manifesto     │            │   │  · React 18          │  │  · SQLAlchemy 2  │ │    │  · live_portrait      │
      │                  │            │   │  · Tailwind 3        │  │  · Pydantic 2    │ │    │  · fish_speech        │
      └──────────────────┘            │   │  · Skyie skin        │  │  · asyncpg       │ │    │  · cosy_voice         │
                                       │   │  · port 3000         │  │  · Celery 5.4    │ │    │  · music_gen          │
                                       │   │                      │  │  · port 8000     │ │    │  · whisper_caption    │
                                       │   │  Routes:             │  │                  │ │    │                       │
                                       │   │   /                  │  │  Routes:         │ │    │  Auth: shared X-API-  │
                                       │   │   /create/*          │  │   /api/v1/auth   │ │    │  Key header           │
                                       │   │   /jobs/[id]         │  │   /api/v1/gen.*  │ │    └───────────┬───────────┘
                                       │   │   /library           │  │   /api/v1/jobs   │ │                │
                                       │   │   /projects          │  │   /api/v1/assets │ │                │ HTTPS
                                       │   │   /brand/*           │  │   /api/v1/brand  │ │  ┌─────────────┘
                                       │   │   /admin             │  │   /api/v1/admin  │ │  │
                                       │   │   /settings          │  │   /api/v1/billing│ │  │
                                       │   │   /login /register   │  │   /api/v1/webhook│ │  │
                                       │   └──────────────────────┘  │   /api/v1/gpu    │ │  │
                                       │                              │   /api/v1/health │ │  │
                                       │                              └────────┬─────────┘ │  │
                                       │                                       │           │  │
                                       │   ┌───────────────────────────────────┼───────────┤  │
                                       │   │  worker (same image, diff cmd)    │           │  │
                                       │   │  celery -A services.job_queue …   │           │  │
                                       │   │  workflows/ orchestration:        │           │  │
                                       │   │   · ai_broll · avatar_pack        │           │  │
                                       │   │   · director · full_production    │ ──────────┴──┘
                                       │   │   · gemini · shots · talking_head │ HTTP to gpu-server
                                       │   │   · v2v · veo_multi_shot          │
                                       │   └───────────┬───────────────────────┘
                                       │               │
                                       │               │     network: skyie-studio-internal (bridge)
                                       │   ┌───────────┴─────────────┬────────────────────────┐
                                       │   ▼                         ▼                        │
                                       │  ┌─────────────────┐   ┌──────────────────┐         │
                                       │  │  Postgres 16    │   │  Redis 7         │         │
                                       │  │  (alpine)       │   │  (alpine)        │         │
                                       │  │                 │   │                  │         │
                                       │  │  Tables:        │   │  Used as:        │         │
                                       │  │  · User         │   │  · Celery broker │         │
                                       │  │  · Job          │   │    (db 0)        │         │
                                       │  │  · Asset        │   │  · Celery result │         │
                                       │  │  · Project      │   │    (db 1)        │         │
                                       │  │  · BrandProfile │   │  · Pub/sub for   │         │
                                       │  │  · ApiKey       │   │    job progress  │         │
                                       │  │  · Subscription │   │  · Sessions /    │         │
                                       │  │  · Credit*      │   │    OTP codes     │         │
                                       │  │  · Usage        │   │                  │         │
                                       │  │  · Webhook…     │   │  256 MB max      │         │
                                       │  │                 │   │  allkeys-LRU     │         │
                                       │  │  postgres_data  │   │  redis_data      │         │
                                       │  │  volume         │   │  volume          │         │
                                       │  └─────────────────┘   └──────────────────┘         │
                                       │                                                      │
                                       │  Volumes attached to backend + worker:               │
                                       │   · assets_data → /app/assets   (generated outputs)  │
                                       │   · temp_data   → /app/temp     (intermediate work)  │
                                       └──────────────────────────────────────────────────────┘
                                                                │
                                                                │  Outbound HTTPS
                                                                ▼
                                       ┌──────────────────────────────────────────────────────┐
                                       │            EXTERNAL SERVICES (off-VPS)               │
                                       │                                                      │
                                       │   · Google Gemini API   (gemini_service.py)          │
                                       │   · Stripe (billing)    (stripe_service.py)          │
                                       │   · MAIELR              (otp_service.py? webhooks?)  │
                                       │   · RunPod GPU Pod      (gpu_client.py — see right)  │
                                       └──────────────────────────────────────────────────────┘
```

---

## 2 · Request flow — "Generate Talking Head"

What happens when a user clicks **Generate** on `/create/talking-head`:

```
   USER                  FRONTEND                BACKEND API           WORKER          GPU SERVER
   browser               (Next.js)               (FastAPI)             (Celery)        (RunPod FastAPI)
     │                       │                       │                    │                  │
     │ POST /api/v1/         │                       │                    │                  │
     │  generate/talking-    │                       │                    │                  │
     │  head                 │                       │                    │                  │
     ├─────────────────────► │                       │                    │                  │
     │                       │ axios → backend       │                    │                  │
     │                       ├─────────────────────► │                    │                  │
     │                       │                       │ 1. validate JWT    │                  │
     │                       │                       │ 2. debit credits   │                  │
     │                       │                       │ 3. INSERT Job row  │                  │
     │                       │                       │    (status=queued) │                  │
     │                       │                       │ 4. enqueue task ──►│ via Redis        │
     │                       │                       │                    │                  │
     │                       │ ◄────────────────────┤ {job_id, …}        │                  │
     │ ◄─────────────────────┤ 200 + job_id         │                    │                  │
     │                       │                       │                    │                  │
     │ router.push           │                       │                    │ pick up task     │
     │ (`/jobs/${job_id}`)   │                       │                    │ status=processing│
     │                       │                       │                    │                  │
     │ open WS               │                       │                    │ load avatar      │
     │ /api/v1/jobs/{id}/ws  │                       │                    │ load script      │
     ├─────────────────────► │                       │                    │                  │
     │                       │ proxy WS → backend    │                    │ ─── HTTPS ─────► │
     │                       ├─────────────────────► │ subscribe to       │                  │
     │                       │                       │ Redis pub/sub      │ inference:       │
     │                       │                       │ channel job:{id}   │  · Fish Speech   │
     │                       │                       │                    │  · LivePortrait  │
     │                       │                       │                    │  · Whisper caps  │
     │                       │                       │                    │ ◄─────────────── │
     │                       │                       │                    │ frames + audio   │
     │                       │                       │                    │                  │
     │                       │                       │                    │ FFmpeg compose   │
     │                       │                       │                    │ (editing_service)│
     │                       │                       │                    │                  │
     │                       │                       │                    │ progress 30 %    │
     │                       │                       │                    │ Redis PUBLISH    │
     │                       │                       │ ◄──────────────────┤ job:{id}         │
     │ ◄─────────────────────┤ ◄────────────────────┤ {progress: 30}     │                  │
     │  (Progress bar         │                       │                    │                  │
     │   updates live)        │                       │                    │ … repeat for     │
     │                       │                       │                    │ each step …      │
     │                       │                       │                    │                  │
     │                       │                       │                    │ DONE             │
     │                       │                       │                    │ UPDATE Job       │
     │                       │                       │                    │ status=completed │
     │                       │                       │                    │ download_url=…   │
     │                       │                       │ ◄──────────────────┤                  │
     │ ◄─────────────────────┤ {status: completed,   │                    │                  │
     │                       │  download_url: …}     │                    │                  │
     │                       │                       │                    │                  │
     │ <video src=…/>        │                       │                    │                  │
     │ rendered output       │                       │                    │                  │
     │                       │                       │                    │                  │
```

Key observations:
- **The backend never blocks on inference.** All long-running jobs go through Celery + Redis. The HTTP request returns within ~50 ms with just the `job_id`.
- **Progress updates** are pushed via Redis pub/sub → WebSocket; the frontend never polls.
- **GPU is decoupled.** The worker shells out to the RunPod GPU server over HTTPS. If the GPU pod is offline, jobs stay queued indefinitely (with a circuit breaker per `services/gpu_client.py`).
- **Assets** (rendered videos, intermediate frames) live on a Docker volume mounted into both backend and worker. The backend serves them with a Content-Disposition header for cross-origin downloads.

---

## 3 · Repository layout

```
skyie-studio/                                   ← root (this repo)
│
├── docker-compose.yml                          ← production deploy spec
├── .env.production                             ← prod secrets (gitignored)
├── .env.example                                ← template
│
├── ARCHITECTURE.md                             ← this file
├── MIGRATION.md                                ← stack upgrade plan
├── ROADMAP.md                                  ← feature roadmap
├── IMPLEMENTATION_PLAN.md                      ← legacy planning
│
├── backend/                                    ← FastAPI + Celery
│   ├── Dockerfile
│   ├── main.py                                 ← FastAPI app entry
│   ├── config.py                               ← Pydantic Settings
│   ├── api/                                    ← 16 route modules
│   │   ├── routes_auth.py        · OTP login + JWT
│   │   ├── routes_generate.py    · POST /generate/{workflow}
│   │   ├── routes_jobs.py        · GET / WebSocket / retry / export
│   │   ├── routes_assets.py      · videos / images / avatars / voices
│   │   ├── routes_brand.py       · brand profiles + scrape
│   │   ├── routes_billing.py     · Stripe checkout + webhooks
│   │   ├── routes_admin.py       · stats + user list
│   │   ├── routes_gpu.py         · GPU registration + heartbeat
│   │   ├── routes_health.py      · /api/v1/health
│   │   └── …
│   ├── services/                               ← business logic
│   │   ├── job_queue.py          · Celery app + task signatures
│   │   ├── auth_service.py       · password / OTP / JWT
│   │   ├── otp_service.py        · email codes
│   │   ├── credit_service.py     · debit / refund
│   │   ├── stripe_service.py     · checkout / billing portal
│   │   ├── gemini_service.py     · prompt enhancement, scrape summarising
│   │   ├── gpu_client.py         · HTTPS client for RunPod
│   │   ├── ffmpeg_service.py     · video composition
│   │   ├── editing_service.py    · scene assembly
│   │   ├── audio_service.py      · TTS + audio mixing
│   │   ├── caption_service.py    · whisper captions
│   │   ├── upscale_service.py    · ESRGAN upscale
│   │   ├── brand_apply_service.py
│   │   ├── brand_scrape_service.py
│   │   ├── prompt_enhance_service.py
│   │   └── storage_service.py    · disk volume IO
│   ├── workflows/                              ← Celery task orchestration
│   │   ├── talking_head.py
│   │   ├── ai_broll.py
│   │   ├── full_production.py
│   │   ├── shots.py
│   │   ├── v2v.py
│   │   ├── director.py
│   │   ├── avatar_pack.py
│   │   ├── gemini.py
│   │   └── veo_multi_shot.py
│   ├── models/                                 ← model wrappers (load + invoke)
│   │   ├── flux_image.py
│   │   ├── wan_video.py
│   │   ├── live_portrait.py
│   │   ├── fish_speech.py
│   │   ├── cosy_voice.py
│   │   ├── music_gen.py
│   │   ├── whisper_caption.py
│   │   └── model_manager.py      · load / unload / VRAM tracking
│   ├── db/
│   │   ├── base.py
│   │   └── models.py             · 11 SQLAlchemy tables
│   ├── alembic/                                ← migrations (5 files)
│   ├── utils/
│   ├── ruff.toml                               ← Python lint config
│   └── requirements.txt
│
├── frontend/                                   ← Next 14 dashboard
│   ├── Dockerfile                              ← multi-stage build
│   ├── src/
│   │   ├── app/                                ← 22 routes
│   │   │   ├── (login | register | settings | admin)
│   │   │   ├── brand/{list,new,[id]}
│   │   │   ├── create/(index + 9 workflows)
│   │   │   ├── jobs/[id]
│   │   │   ├── library / projects
│   │   │   ├── icon.tsx + apple-icon.tsx       ← procedural Drift mark
│   │   │   ├── layout.tsx + globals.css        ← Skyie tokens
│   │   │   └── fonts.ts                        ← Inter + JetBrains Mono
│   │   ├── components/
│   │   │   ├── app-shell.tsx
│   │   │   ├── sidebar.tsx + topbar.tsx        ← re-skinned
│   │   │   ├── ui/  (16 shadcn primitives, all re-skinned)
│   │   │   └── skyie/                          ← brand-specific
│   │   │       ├── DriftMark.tsx
│   │   │       ├── MotionPolicyProvider.tsx
│   │   │       └── TimeStamp.tsx
│   │   ├── hooks/use-job-progress.ts           ← WebSocket
│   │   └── lib/
│   │       ├── api.ts                          ← axios + endpoints
│   │       ├── auth.tsx                        ← React context
│   │       ├── store.ts                        ← Zustand (sidebar state)
│   │       ├── utils.ts                        ← cn()
│   │       └── skyie/                          ← Drift + motion math
│   ├── public/
│   │   ├── fonts/                              ← woff2 (4 files)
│   │   └── brand/                              ← legacy SVGs (now redundant)
│   └── package.json + tailwind.config.ts
│
├── marketing/                                  ← Next 16 marketing site
│   ├── src/app/                                ← 5 public routes + /dev
│   │   ├── (root) /system /work /access /manifesto
│   │   ├── icon.tsx + opengraph-image.tsx + sitemap.ts + robots.ts
│   │   └── api/event/route.ts                  ← analytics stub
│   ├── src/components/{brand,motion,sections,system,system-page,work}
│   ├── src/lib/{drift,motion,hooks}
│   ├── src/content/{home,work,access,manifesto}.ts
│   ├── DECISIONS.md                            ← architecture log
│   ├── LICENSES.md                             ← font OFL attribution
│   └── package.json + tailwind via @theme in CSS
│
├── gpu-server/                                 ← RunPod inference daemon
│   ├── Dockerfile
│   ├── server.py                               ← FastAPI inference endpoints
│   ├── model_registry.py                       ← model catalogue
│   ├── startup.sh
│   ├── RUNPOD_SERVER_CREDENTIALS.md
│   └── requirements.txt
│
├── scripts/                                    ← deploy / migrate helpers
└── .github/                                    ← CI workflows (1 dir)
```

---

## 4 · Tech stack at a glance

| Layer | Tech | Version (today) |
|---|---|---|
| **Frontend (dashboard)** | Next.js + React + Tailwind | 14.2 / 18.3 / 3.4 *(see MIGRATION.md)* |
| **Frontend (marketing)** | Next.js + React + Tailwind | 16.2 / 19.2 / 4.2 |
| **Backend API** | FastAPI + Pydantic 2 | 0.115 / 2.10 |
| **Async ORM** | SQLAlchemy 2 + asyncpg | 2.0.36 / 0.30 |
| **Migrations** | Alembic | 1.14 |
| **Task queue** | Celery + Redis | 5.4 / 5.2 (Redis 7) |
| **Database** | Postgres | 16-alpine |
| **GPU runtime** | torch + diffusers + transformers | 2.5+ / 0.31+ / 4.46+ |
| **Reverse proxy** | Traefik | external — auto-TLS |
| **Containerisation** | Docker Compose | bridge + external network |
| **Hosting** | Contabo VPS + RunPod GPU | dual-machine split |
| **Auth** | Email-OTP + JWT | hand-rolled (`auth_service.py`) |
| **Billing** | Stripe | 12.1 |
| **LLM** | Google Gemini | (gemini_service.py) |

---

## 5 · Network + auth boundaries

```
                    ┌──────────────────────────────────────────────────────────┐
                    │  PUBLIC INTERNET                                          │
                    │                                                           │
                    │  - browser → frontend / marketing      (HTTPS, no auth)   │
                    │  - browser → backend                   (HTTPS + JWT in    │
                    │                                         Authorization     │
                    │                                         header)           │
                    │  - Stripe webhooks → backend           (HTTPS + sig)      │
                    │  - MAIELR webhooks → backend           (HTTPS + secret)   │
                    └──────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                    ┌──────────────────────────────────────────────────────────┐
                    │  TRAEFIK (SkyieProxy network — external)                  │
                    │                                                           │
                    │  Terminates TLS, routes by Host header.                   │
                    │  Health-checks both frontend and backend.                 │
                    └──────────────────────────────────────────────────────────┘
                                              │
                                              ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │                 INTERNAL (skyie-studio-internal — bridge)         │
        │                                                                   │
        │  postgres ↔ backend     (asyncpg, no auth needed inside network)  │
        │  redis    ↔ backend     (db 0, 1, no auth)                        │
        │  redis    ↔ worker      (db 0, 1, no auth)                        │
        │  postgres ↔ worker      (asyncpg)                                 │
        │  backend  ↔ worker      (Celery via Redis — no direct comms)      │
        └──────────────────────────────────────────────────────────────────┘
                                              │
                                              │ outbound only
                                              ▼
                    ┌──────────────────────────────────────────────────────────┐
                    │  EXTERNAL CALLS (HTTPS, API keys)                         │
                    │                                                           │
                    │  worker → RunPod GPU pod      (X-API-Key header,          │
                    │                                shared secret)             │
                    │  worker → Google Gemini       (GEMINI_API_KEY)            │
                    │  backend → Stripe API          (STRIPE_API_KEY)           │
                    │  backend → MAIELR              (MAIELR_API_KEY)           │
                    └──────────────────────────────────────────────────────────┘
```

Key points:
- **Postgres and Redis are not exposed to the internet.** They live on the
  `skyie-studio-internal` bridge network and are only reachable from
  backend / worker containers.
- **The GPU server is the only external compute.** It runs on RunPod
  (separate machine) and is reached via outbound HTTPS from the worker.
  The backend itself never talks to the GPU directly — only the Celery
  worker does (via `services/gpu_client.py`).
- **Auth is JWT for the dashboard, X-API-Key for GPU**, plus signed
  webhooks from Stripe / MAIELR.

---

## 6 · Where each surface deploys

| Surface | What | Where | Today |
|---|---|---|---|
| `marketing/` | Marketing site (`skyie.studio`) | Vercel (recommended) | Built; deploy steps in [DEPLOYMENT.md](DEPLOYMENT.md) |
| `frontend/` | App dashboard (`app.skyie.studio`) | Contabo VPS (docker-compose) | Live · Traefik label rewired 2026-04-27 |
| `backend/` | API (`api.skyie.studio`) | Contabo VPS (docker-compose) | Live |
| `backend/` (worker) | Celery worker | Same Contabo VPS, separate container | Live |
| `gpu-server/` | Inference daemon | RunPod GPU pod | Live |
| `postgres` / `redis` | Data tier | Contabo VPS (docker-compose volumes) | Live |

The full cutover runbook (DNS, Vercel project setup, switchover order,
rollback) lives in [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 7 · What's *not* in the picture (yet)

- **No CDN in front of generated assets.** Videos and images served
  from `/app/assets/` go straight from the backend container. At scale,
  put Cloudflare R2 or similar in front and signed-URL downloads.
- **No observability layer.** No Sentry / Prometheus / Grafana / log
  aggregator. Errors today are visible only via `docker logs`.
- **No staging environment.** `docker-compose.yml` is production. A
  `docker-compose.staging.yml` would let new workflows soak before
  going live.
- **GPU autoscaling is single-pod.** RunPod pod is on/off. There's a
  heartbeat (`GPU_HEARTBEAT_TIMEOUT: 120`) and the dashboard surfaces
  `online/offline`, but no automatic spin-up of additional pods under
  queue pressure.
- **Backups.** `postgres_data` and `assets_data` are Docker volumes on
  the VPS. No off-host backup is wired in this compose file.

These are deferred and worth planning separately.

---

*End of architecture overview.*
