# Upgrade progress — Option A (single unified Next app)

> Goal: collapse `frontend/` + `marketing/` into one Next.js app served
> by one container, where `skyie.studio` and `app.skyie.studio` are
> handled via route groups and a hostname-aware middleware.
>
> Pre-requisite: `frontend/` must be on the same stack as `marketing/`
> first (Next 16 / React 19 / Tailwind 4). The first three phases below
> are pure framework upgrades, contained to `frontend/` only.

---

## Phase tracker

| Phase | Title | Status | Branch | Time est. | Reference |
|---|---|---|---|---|---|
| **0** | Adapt compose to new shared proxy | ✅ done | `feat/ui-refresh` | 15 min | this commit |
| **1** | Tailwind 3 → 4 (frontend) | 🔄 in progress | `chore/tw4` | ~1 day | [§1](#phase-1) |
| **2** | Next 14 → 15 + React 18 → 19 | ⬜ not started | `chore/next-15-react-19` | ~2 days | [§2](#phase-2) |
| **3** | Next 15 → 16 | ⬜ not started | `chore/next-16` | ~1 day | [§3](#phase-3) |
| **4** | Merge marketing into frontend (route groups + hostname middleware) | ⬜ not started | `feat/unified-app` | ~1-2 days | [§4](#phase-4) |
| **5** | Drop marketing/, finalise compose, verify | ⬜ not started | (in #4) | 30 min | [§5](#phase-5) |
| **6** | Browser smoke + production deploy | ⬜ not started | — | half day | [§6](#phase-6) |

**Total elapsed: ~6–7 working days** for the full sequence. Each phase
is independently merge-able to `main`.

---

## Phase 0 — adapt compose to new shared proxy ✅

Already done. Old Let's Encrypt cert-resolver labels stripped; security
headers / compression / HTTP→HTTPS redirect now provided globally by
`/opt/skyie-proxy/`. Cloudflare Origin CA covers `*.skyie.studio` so
`tls=true` is enough.

---

## Phase 1 — Tailwind 3 → 4

**Why first:** purely tooling. Doesn't change runtime behaviour. If it
breaks, the failure is visible immediately (everything looks wrong).
Done under the current Next 14 / React 18 stack, so failures are
isolated to CSS — not interleaved with hydration regressions from
React 19.

**Scope:** `frontend/` only. `marketing/` is already on Tailwind 4.

### Steps

1. Run `pnpm dlx @tailwindcss/upgrade@latest` from `frontend/`. The
   codemod handles ~80% of cases:
   - Bumps `tailwindcss` to v4 + adds `@tailwindcss/postcss`
   - Moves `tailwind.config.ts` → `@theme` block in `globals.css`
   - Updates `postcss.config.mjs`
   - Replaces deprecated utility classes
2. Manual review of converted config:
   - The Skyie palette tokens (`--ink-rgb`, `--paper-rgb`, etc.) need
     to survive intact in the new `@theme` syntax.
   - Custom utilities (`text-display`, `text-h1`, `text-h2`, `text-h3`,
     `text-mono-sm`, `text-caption`, `font-mono-tabular`) need to be
     rewritten as `@utility` directives — mirror what `marketing/src/app/globals.css`
     already does.
3. Drop `tailwindcss-animate` if its keyframes are now in core. If not,
   switch to `tw-animate-css` (the v4 successor).
4. `pnpm build` and walk every page. Likely friction:
   - Arbitrary value syntax (`bg-[rgb(var(--ink-rgb))]`) may need to
     change. Tailwind 4 supports `bg-(--ink-token)` style.
   - The 16 shadcn primitives (`src/components/ui/`) may have small
     class-name regressions where v3 utilities no longer exist.

### Rollback

`git revert` the Phase 1 commit. Tailwind 3 still installs cleanly.

### Resume hooks

- If Phase 1 ran but failed mid-codemod, run `pnpm dlx @tailwindcss/upgrade@latest --force` to re-run.
- If page renders look broken, check `frontend/src/app/globals.css` `@theme` block first — the Skyie palette is the load-bearing part.

---

## Phase 2 — Next 14 → 15 + React 18 → 19

**Why coupled:** Next 15 is the first version with full React 19 support.
Doing them as one branch means one CI run, one diff to review.

**Why before Next 16:** Next 15 introduces *temporary* synchronous
compatibility for `cookies() / headers() / params / searchParams`. Next
16 *removes* it. Going through 15 first means deprecation warnings
arrive cleanly before the strict enforcement lands.

### Steps

1. `pnpm dlx @next/codemod@canary upgrade 15` from `frontend/`.
2. Manual review:
   - `src/lib/auth.tsx` — async API reads in the auth context
   - `src/app/page.tsx` — `searchParams.get('job')` highlight
   - `src/app/jobs/[id]/page.tsx` — `params.id` reads (now async)
3. Bump `@radix-ui/*` to React 19-compatible versions (`pnpm up @radix-ui/*`).
4. `pnpm typecheck && pnpm build`.
5. Walk every authenticated route, especially:
   - `/jobs/[id]` — params + searchParams + WebSocket
   - `/login` + `/register` — useEffect + forms
   - `/library` — file uploads via FormData

### Known gotchas

- Hydration mismatches from Date/locale formatting are stricter in 19.
- Suspense behaviour changes for client components reading third-party data — check the WebSocket-driven dashboard.
- React 19's ref-as-prop is *available* but not required; `forwardRef` still works.

### Resume hooks

- If you see a flood of `Type 'Promise<…>' is not assignable` errors on `params` / `searchParams`, the codemod missed them. Run `npx @next/codemod@canary next-async-request-api .` directly.

---

## Phase 3 — Next 15 → 16

**Why a separate phase:** smaller change set than 14→15. Doing it in
isolation lets it fail loudly without confounding factors.

### Steps

1. `pnpm dlx @next/codemod@canary upgrade latest`.
2. Update `next.config.{ts,mjs}`:
   - `experimental.turbopack.*` → top-level `turbopack.*`
   - Drop `eslint` config block
   - `images.domains` → `images.remotePatterns`
3. `next typegen` once to produce `PageProps<>`, `LayoutProps<>`, `RouteContext<>`.
4. Update `package.json` scripts:
   - `dev: next dev --turbopack` (Turbopack is now default; flag is harmless but explicit)
   - `build: next build --turbopack`
   - `lint: eslint`  (← `next lint` was removed)
5. `pnpm dlx @next/codemod@canary next-lint-to-eslint-cli .` migrates lint config.

### Known gotchas

- `images.minimumCacheTTL` default is now 4 hours (was 60s). Brand logo previews may look stale on first deploy.
- Local image query strings (`?v=…` cache busters) now need `images.localPatterns` config.

---

## Phase 4 — merge marketing into frontend

Once `frontend/` is on Next 16 / React 19 / Tailwind 4, both projects
share the same stack and the merge is mechanical.

### Target structure

```
frontend/src/app/
  ├── (public)/                    ← served on skyie.studio (no auth)
  │   ├── layout.tsx               ← public chrome (DriftCursor, marketing nav)
  │   ├── page.tsx                 ← from marketing/src/app/page.tsx
  │   ├── system/page.tsx
  │   ├── work/page.tsx
  │   ├── access/page.tsx
  │   ├── manifesto/page.tsx
  │   └── api/event/route.ts
  ├── (authenticated)/              ← served on app.skyie.studio (auth)
  │   ├── layout.tsx               ← AppShell + Topbar + Sidebar
  │   ├── page.tsx                 ← dashboard (current /)
  │   ├── create/, library/, projects/, brand/, jobs/[id]/, settings/, admin/
  │   ├── login/page.tsx           ← exception: served on skyie.studio + app.*
  │   └── register/page.tsx        ← exception: same
  ├── icon.tsx + apple-icon.tsx     ← procedural Drift, shared
  ├── opengraph-image.tsx           ← from marketing
  ├── sitemap.ts                    ← public-only
  ├── robots.ts                     ← root: public allow + /app disallow
  └── middleware.ts                 ← hostname → route group rewrite

frontend/src/components/
  ├── (existing — sidebar, topbar, app-shell, ui/16-primitives, skyie/4-files)
  ├── brand/, motion/, sections/, work/      ← from marketing/
  └── system-page/                  ← from marketing/

frontend/src/lib/
  ├── (existing — api, auth, store, utils, skyie/{drift,motion})
  └── hooks/usePointer.ts          ← from marketing

frontend/src/content/
  └── home.ts + work.ts + access.ts + manifesto.ts  ← from marketing
```

### Middleware logic

```ts
// frontend/src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const url = req.nextUrl.clone();
  const isApp = host.startsWith("app.");

  // Marketing host hitting an auth-only path → redirect to app subdomain
  if (!isApp && /^\/(create|library|projects|brand|jobs|settings|admin)/.test(url.pathname)) {
    return NextResponse.redirect(new URL(url.pathname, `https://app.skyie.studio`));
  }
  // App host hitting a marketing-only path → redirect to apex
  if (isApp && /^\/(system|work|access|manifesto)$/.test(url.pathname)) {
    return NextResponse.redirect(new URL(url.pathname, `https://skyie.studio`));
  }
  // Login + register live on both hostnames; let them through
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|icon|apple-icon|opengraph-image|sitemap.xml|robots.txt|api/).*)"],
};
```

The route groups (`(public)` / `(authenticated)`) are layout-only — they
don't affect URLs. So `/system` resolves to `(public)/system`, and `/`
on app.skyie.studio resolves to `(authenticated)/page.tsx`.

### Steps

1. Move marketing files into the appropriate places (single `git mv`
   batch). Update import paths.
2. Wire `middleware.ts` for hostname routing.
3. Wire `app/(public)/layout.tsx` and `app/(authenticated)/layout.tsx`
   from the existing layouts.
4. Update `frontend/src/app/layout.tsx` (root) to be neutral — provide
   `<html>`, fonts, MotionPolicyProvider, but no sidebar/cursor.
5. Resolve duplicate components (DriftMark exists in both — keep the
   one at `src/components/skyie/DriftMark.tsx`).
6. Move marketing's `DECISIONS.md`, `LICENSES.md` content into
   `frontend/` (or root).

### Validation

- `pnpm build` — count routes; should be 22 dashboard + 5 marketing + 4 metadata files = ~31 routes.
- Test middleware via curl with `Host:` header overrides.
- Browser smoke per ARCHITECTURE.md §2.

---

## Phase 5 — drop marketing/, finalise

```bash
rm -rf marketing/
```

Then docker-compose: the frontend label adds a second host:

```yaml
- "traefik.http.routers.skyie-frontend.rule=Host(`skyie.studio`) || Host(`app.skyie.studio`)"
```

Update `docker-compose.yml` env vars: frontend now needs both
`NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL`.

---

## Phase 6 — browser smoke + deploy

- `pnpm build && pnpm start` locally with `Host: skyie.studio` and `Host: app.skyie.studio` overrides via curl
- DNS: ensure `app.skyie.studio` A-record exists pointing to the VPS
- Push to VPS: `docker compose up -d --build frontend`
- Watch Traefik dashboard at `https://traefik.skyieglobal.com` for cert issuance + healthy status
- Walk every public route on `skyie.studio` + every authenticated route on `app.skyie.studio`

---

## What this replaces

- ❌ `DEPLOYMENT.md` Vercel runbook (no longer needed — everything self-hosted)
- ❌ The plan to add a separate `marketing` service to docker-compose

When Phase 6 ships, `DEPLOYMENT.md` will be rewritten to reflect the
unified topology. For now treat its Vercel section as obsolete.

---

*Updated 2026-04-27. This file is the single source of truth for upgrade progress — update it as each phase ships.*
