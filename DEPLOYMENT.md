# Deployment topology + switchover runbook

> Snapshot date: **2026-04-27**.
> Companion to [ARCHITECTURE.md](ARCHITECTURE.md). Where ARCHITECTURE.md
> documents what the system looks like, this doc documents how to deploy
> it and how to flip the apex from the dashboard to the marketing site.

---

## 1 · Target topology (after switchover)

| Surface | Hostname | Where it runs | What's there |
|---|---|---|---|
| Marketing | `https://skyie.studio` | **Vercel** (edge) | `marketing/` — Next 16, static-ish, no DB |
| Dashboard | `https://app.skyie.studio` | Contabo VPS (Traefik → frontend container, port 3000) | `frontend/` — Next 14, auth-walled |
| API | `https://api.skyie.studio` | Contabo VPS (Traefik → backend container, port 8000) | `backend/` — FastAPI |
| Workers | (no public URL) | Contabo VPS (worker container) | Celery, internal only |
| GPU | (no public URL) | RunPod GPU pod | `gpu-server/` — FastAPI inference daemon |
| Postgres + Redis | (no public URL) | Contabo VPS, internal bridge network | data tier |

**The only thing that changed in this rewiring:** the Traefik label on
the `frontend` service in `docker-compose.yml`.
`Host(\`skyie.studio\`)` → `Host(\`app.skyie.studio\`)`.

Everything else (backend routing, GPU client, internal Postgres / Redis,
Celery worker) is unchanged.

---

## 2 · DNS records

Configure these at your registrar (or Cloudflare DNS if you use it for
the apex). Replace `<vps-ip>` with the Contabo VPS public IPv4.

| Type | Name | Value | Used by |
|---|---|---|---|
| `A` (or `CNAME`) | `@` (apex / `skyie.studio`) | Vercel IPs *or* `cname.vercel-dns.com` | Marketing site |
| `A` | `app` (`app.skyie.studio`) | `<vps-ip>` | Dashboard via Traefik |
| `A` | `api` (`api.skyie.studio`) | `<vps-ip>` | Backend via Traefik |
| `MX` | `@` | as configured | (unchanged — keep your existing MX) |
| `TXT` | `_vercel` | (Vercel will give you this when adding the domain) | Vercel ownership proof |

**Vercel-specific notes:**
- For an apex (`skyie.studio`), Vercel prefers `A` records to their
  fixed IPs. Their dashboard tells you the exact set when you add the
  domain — copy from there. Falling back to `ALIAS` / `ANAME`
  (Cloudflare flattening) also works.
- For the `www.skyie.studio` 301 redirect to `skyie.studio` (or vice
  versa), configure inside the Vercel project under Domains.

---

## 3 · Marketing → Vercel · first-time setup

**One-time, ~15 min.**

1. **Push `marketing/` to a Git remote.** It's currently a folder inside
   the monorepo. Vercel can deploy from a subfolder — set the Vercel
   project root directory to `marketing/` and the framework preset to
   Next.js. Or split `marketing/` into its own repo if you want a clean
   boundary.

2. **Create the Vercel project:**
   ```
   Vercel dashboard → Add New → Project →
     Import the repo →
     Root directory: marketing
     Framework: Next.js (auto-detected)
     Build command: (default — `next build`)
     Install command: (default — `pnpm install`)
     Output directory: (default — `.next`)
   ```

3. **Environment variables (Vercel project settings → Environment Variables):**
   ```
   NEXT_PUBLIC_APP_URL = https://app.skyie.studio
   NEXT_PUBLIC_SITE_URL = https://skyie.studio
   ```
   The marketing header reads `NEXT_PUBLIC_APP_URL` for the "Sign in"
   CTA (`marketing/src/components/system/Header.tsx`). Without this
   override the default is already `https://app.skyie.studio`, so it
   works without the env var — but setting it explicitly future-proofs
   stage / preview deploys.

4. **Add the custom domain:**
   ```
   Project → Settings → Domains → Add → skyie.studio
   ```
   Vercel will display the DNS records you need to set. Apply them at
   your registrar. TLS is auto-issued.

5. **First push deploys.** Verify:
   ```bash
   curl -I https://skyie.studio                              # → 200, served by Vercel
   curl https://skyie.studio/sitemap.xml | head -5           # → valid XML
   curl -I https://skyie.studio/icon                         # → 200 image/png
   ```

6. **Test the cross-site handoff:** open `https://skyie.studio`, click
   the "Sign in" button in the header, you should land at
   `https://app.skyie.studio/login`.

---

## 4 · Switchover runbook (production cutover)

**Pre-conditions:** Marketing is live at Vercel under
`*.vercel.app` preview URL. DNS for `app.skyie.studio` resolves to the
VPS (set this up beforehand — wait for propagation).

**Order matters.** Do not do these out of order; you'll create a window
where users hit a stale `Host` rule.

### Step 1 — Add the new app subdomain (no apex change yet)

```bash
# at registrar / Cloudflare
A   app.skyie.studio   <vps-ip>
```

Wait for propagation (`dig app.skyie.studio`). Should resolve to the
VPS within 1–60 minutes.

### Step 2 — Push the new docker-compose to the VPS

```bash
ssh vps
cd /path/to/skyie-studio
git pull origin main          # picks up the new Host rule
docker compose up -d frontend # rolling restart of frontend container
```

Traefik will issue a new Let's Encrypt cert for `app.skyie.studio` on
first request. The old cert for `skyie.studio` stays issued (Traefik
will renew it as long as it's referenced) — but you should remove that
label after Step 4.

Verify:

```bash
curl -I https://app.skyie.studio/login   # → 200
```

**At this point both `https://skyie.studio` and `https://app.skyie.studio`
hit the dashboard.** That's fine — it's a transition window.

### Step 3 — Push marketing to Vercel as a preview

```bash
# in your local marketing/ checkout, on a branch
git push origin feature/marketing-apex
# Vercel creates a preview at *.vercel.app — visit it, walk every page
```

When happy, merge to `main`. Vercel auto-deploys to the production
domain (which is still its `*.vercel.app` URL because we haven't
attached `skyie.studio` yet).

### Step 4 — Flip the apex

```bash
# at registrar / Cloudflare — apex DNS records
# Replace your existing A record(s) for the apex.
A    @    <vercel-ip-1>
A    @    <vercel-ip-2>
A    @    <vercel-ip-3>
A    @    <vercel-ip-4>
# (or a single ALIAS / ANAME / CNAME-flattened record)
```

Vercel needs the apex attached in their dashboard *before* DNS flips,
so do that as part of Step 3. The first request after DNS propagation
triggers Let's Encrypt issuance via Vercel.

Verify:

```bash
curl -I https://skyie.studio                    # → served by Vercel (check headers: server: Vercel)
curl -I https://app.skyie.studio                # → served by Traefik (check headers: traefik or no server header)
curl -I https://api.skyie.studio/api/v1/health  # → 200, JSON
```

### Step 5 — Clean up the old cert / label

After 48 hours of green DNS:

- The Let's Encrypt cert Traefik issued for `skyie.studio` is no longer
  used. Traefik will stop renewing it once the label is gone (the label
  is what registers it for renewal). The cert files in
  `letsencrypt/acme.json` can be left — they expire harmlessly.

### Rollback plan

If Vercel marketing deploy is broken after the apex flip:

1. Revert apex DNS to the VPS IP (Step 4 reversed).
2. Revert the `docker-compose.yml` change (`app.skyie.studio` →
   `skyie.studio`) and `docker compose up -d frontend`.
3. Within ~10 minutes (DNS TTL + Traefik restart), the apex serves the
   dashboard again.

Keep the docker-compose change available as a single-commit revert
during the cutover window.

---

## 5 · Local development

After this rewiring, local dev for the three surfaces:

```
Marketing  : localhost:3000   (cd marketing && pnpm dev)
Frontend   : localhost:3001   (cd frontend  && pnpm dev)   — port shifts because marketing claimed 3000
Backend    : localhost:8000   (docker compose up backend postgres redis)
```

**CORS in dev:** the backend now reads `CORS_ORIGINS` from
`backend/config.py`, which by default allows `localhost:3000–3002`. Both
marketing's `/api/event` (if it ever calls the backend) and frontend's
axios client work without further config.

**Cross-site link in dev:** the marketing header's "Sign in" defaults
to `https://app.skyie.studio/login`. To test the handoff against your
local dashboard, set `NEXT_PUBLIC_APP_URL=http://localhost:3001` in
`marketing/.env.local`.

---

## 6 · What changed in code

This commit (or thereabouts):

| File | Change |
|---|---|
| `docker-compose.yml` | Frontend Traefik `Host` rule: `skyie.studio` → `app.skyie.studio`. |
| `backend/config.py` | New `CORS_ORIGINS` setting (comma-separated) with sensible defaults for dev + prod hosts. |
| `backend/main.py` | `CORSMiddleware` reads `settings.CORS_ORIGINS` instead of `["*"]`. Spec-valid (was technically broken with `allow_credentials=True` + `*`). |
| `frontend/src/app/layout.tsx` | Added `metadataBase: https://app.skyie.studio` and `robots: { index: false }` (defence-in-depth). |
| `frontend/src/app/robots.ts` | New file. Disallows all crawlers (the dashboard is auth-walled). |
| `marketing/src/components/system/Header.tsx` | Added "Sign in" CTA pointing to `${NEXT_PUBLIC_APP_URL}/login`. |

No backend logic, no DB schema, no GPU code touched.

---

## 7 · What you (the operator) need to do

In rough order:

1. **Decide where marketing deploys.** Vercel is recommended (see §3
   for why). Cloudflare Pages or Netlify are equivalent options.
2. **Set up the Vercel project** per §3.
3. **Add the `app.skyie.studio` DNS A record** to your registrar (§2).
4. **Push the new `docker-compose.yml`** to the VPS and `docker compose
   up -d frontend` (§4 step 2).
5. **Verify `app.skyie.studio` works** before doing anything to the apex
   (§4 step 2 check).
6. **Attach the apex domain to Vercel** + flip apex DNS (§4 step 4).
7. **Verify the three hosts** (§4 step 4 check) and watch for cert
   issuance.
8. **Update `.env.production`** to set `CORS_ORIGINS` explicitly (or
   leave it on defaults — defaults already include the production
   hosts).

Total elapsed time: ~30 min once Vercel project is set up. The bulk is
DNS propagation waits.

---

*End of deployment plan.*
