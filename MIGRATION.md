# Stack audit & migration plan — April 2026

> Snapshot date: **2026-04-27**.
> Two app surfaces in this repo: `marketing/` (greenfield, current) and
> `frontend/` (production app, lagging). This document audits both and
> proposes a phased migration of `frontend/` to parity.

---

## 1 · Current state

### marketing/ — current ✅

| Layer | Installed | April 2026 stable | Status |
|---|---|---|---|
| Next.js | **16.2.4** | 16.x | ✅ current |
| React / react-dom | **19.2.4** | 19.2 | ✅ current |
| Tailwind CSS | **4.2.4** | 4.x | ✅ current |
| `@tailwindcss/postcss` | **4.2.4** | 4.x | ✅ current |
| TypeScript | **5.9.3** | 5.9 | ✅ current |
| ESLint | **9.39.4** | 9.x (10 in beta) | ✅ current |
| `eslint-config-next` | **16.2.4** | tied to Next | ✅ current |
| Motion (Framer successor) | **12.38.0** | 12.x | ✅ current |
| GSAP | **3.15.0** | 3.x | ✅ current *(installed, not imported)* |
| Lenis | **1.3.23** | 1.x | ✅ current |
| `@react-three/fiber` | **9.6.0** | 9.x | ✅ current *(installed, not imported)* |
| `@react-three/drei` | **10.7.7** | 10.x | ✅ current *(installed, not imported)* |
| three | **0.184.0** | 0.18x | ✅ current *(installed, not imported)* |
| Vitest | **4.1.5** | 4.x | ✅ current |
| `@testing-library/react` | **16.3.2** | 16.x | ✅ current |
| jsdom | **29.1.0** | 29.x | ✅ current |

The unused R3F + three + GSAP installs are documented in
`marketing/DECISIONS.md` — I went hand-rolled rAF + raw WebGL because the
brief's needs fit cleanly without the framework overhead. They remain in
package.json so the next contributor can adopt them when a section grows
beyond what hand-written code handles cleanly. **None ship in the
client** (verified by grepping `.next/static/chunks` post-build).

### frontend/ — lagging ⚠️

| Layer | Installed | April 2026 stable | Gap | Notes |
|---|---|---|---|---|
| **Next.js** | **14.2.35** | 16.2.4 | **2 majors** | High-touch upgrade |
| **React / react-dom** | **18.3.1** | 19.2.4 | **1 major** | Coupled to Next 16 |
| **Tailwind CSS** | **3.4.1** | 4.2.4 | **1 major** | Independent, but heavy CSS rewrite |
| TypeScript | **5.9.3** | 5.9 | — | ✅ current |
| **ESLint** | **8.57.1** | 9.39.4 | **1 major** | Coupled to `eslint-config-next` upgrade |
| `eslint-config-next` | **14.2.35** | tied to Next | (auto with Next upgrade) | |
| `@radix-ui/*` (11 packages) | 1.x / 2.x | 1.x / 2.x | — | ✅ current |
| `zustand` | **5.0.11** | 5.x | — | ✅ current |
| `axios` | **1.13.5** | 1.x | — | ✅ current |
| `sonner` | **2.0.7** | 2.x | — | ✅ current |
| `lucide-react` | **0.564.0** | 0.5x | — | ✅ current |
| `class-variance-authority` | **0.7.1** | 0.7.x | — | ✅ current |
| `clsx` + `tailwind-merge` | 2 + 3 | 2 / 3 | — | ✅ current |
| `tailwindcss-animate` | **1.0.7** | 1.0.7 | — | ✅ current *(rewrite needed if migrating Tailwind 4 — see §3.A.4)* |

**Summary:** the framework layer (Next, React, Tailwind, ESLint) is what
needs upgrading. Every other dep is current. The Radix and shadcn-style
components I re-skinned in `feat/ui-refresh` already work against the
new tokens, so the upgrade's surface is the framework, not the UI.

---

## 2 · Why upgrade

| Benefit | Magnitude | Capture-via |
|---|---|---|
| Async params/searchParams + Server Actions ergonomics | Medium | Next 15 |
| `<ViewTransition>` from React 19.2 — natively supported drawer / modal transitions | Medium | React 19 |
| Stable React Compiler — automatic memoisation, fewer hand-written `useMemo` | High (long-term) | React 19 + Next 16 (opt-in) |
| Turbopack default for `next dev` *and* `next build` — 2-5× faster dev cycles | High (DX) | Next 16 |
| Tailwind 4 CSS-first config — no JS config file, faster build, native CSS variables | Medium (DX) | Tailwind 4 |
| `app/proxy.ts` (renamed from `middleware.ts`) | Low | Next 16 |
| Stable cache APIs (`cacheLife`, `cacheTag`, `revalidateTag` with profiles) | Medium (data) | Next 16 |
| ESLint 9 flat config — better config sharing, faster lint | Low (DX) | ESLint 9 |
| Removed: `next lint`, AMP, `serverRuntimeConfig`, `images.domains` | Maintenance | Next 16 |
| React 19 `use` for promises in client components, ref-as-prop | Medium | React 19 |

**Costs:**
- Two major Next upgrades (14 → 15 → 16) with breaking async API changes
- Tailwind 4's CSS-first config requires every `tailwind.config.ts` to be re-expressed in CSS via `@theme`
- All `cookies() / headers() / params / searchParams` reads must become `await`-ed
- Some Radix/shadcn primitives may have minor React 19 type incompatibilities
- ESLint 8 → 9 means flat config rewrite

---

## 3 · Migration plan

**Recommended order** is below. Each phase is independently merge-able
to `main` and can sit there for as long as you want before starting the
next phase.

### Phase 0 · Pre-flight  *(half-day)*

1. **Merge `feat/ui-refresh` to `main`** so the design system is the
   baseline and primitives don't double-migrate.
2. **Pin Node** in `frontend/package.json` `engines.node` to `>=20.9`
   (Next 16's minimum). Check current CI / Docker image — if it's
   shipping Node 18, bump.
3. **Add `frontend/package.json` `scripts`:**
   ```json
   "typecheck": "tsc --noEmit",
   "test": "echo 'no tests yet — see MIGRATION.md'",
   "lint:strict": "next lint --max-warnings=0"
   ```
   (Get a baseline error count before any upgrade.)
4. **Capture before-state**:
   - `pnpm build > before-build.log` — first-load JS sizes, route count
   - Take screenshots of 5 representative routes at desktop + mobile
5. **Branch**: `chore/upgrade-tailwind-4`.

---

### Phase A · Tailwind 3 → 4  *(1 day; independent of Next/React)*

**Why first:** Tailwind 4 is purely tooling — it doesn't change runtime
behaviour. If something breaks, the failure is visible immediately
(everything looks wrong) and rollback is a `git checkout`. Doing it
under the current Next 14 / React 18 means failures are isolated to CSS,
not interleaved with hydration regressions.

**Steps:**

1. **Read** the official upgrade guide:
   ```bash
   open https://tailwindcss.com/docs/upgrade-guide
   ```
2. **Run the codemod:**
   ```bash
   cd frontend
   pnpm dlx @tailwindcss/upgrade@latest
   ```
   This will:
   - Upgrade `tailwindcss` to v4
   - Move `tailwind.config.ts` content into a `@theme` block in `globals.css`
   - Update PostCSS config (`postcss.config.mjs`) to use `@tailwindcss/postcss`
   - Replace deprecated utility classes (e.g. `shadow-sm` → `shadow-xs` in places)
3. **Manual review** of the converted config:
   - The Skyie palette I added (`--ink-rgb`, `--paper-rgb`, etc.) is
     already in `globals.css` and `tailwind.config.ts`. After the
     codemod, verify those tokens are still expressed correctly under
     Tailwind 4's `@theme` syntax. The pattern from `marketing/globals.css`
     is the reference.
4. **Drop `tailwindcss-animate`** if its built-ins (animate-spin, fade,
   slide) are now provided by Tailwind 4 core. If not, switch to
   `tw-animate-css` which is the v4-compatible successor.
5. **Build + visual smoke test:**
   ```bash
   pnpm build
   pnpm dev
   ```
   Walk every page. Most likely breakage points:
   - Custom utilities I wrote (`text-display`, `text-h1`, `text-mono-sm`,
     `font-mono-tabular`) — these need to be re-expressed under
     Tailwind 4's `@utility` directive (mirror what I did in
     `marketing/src/app/globals.css`).
   - Arbitrary value syntax — `bg-[rgb(var(--ink-rgb))]` may need to
     become `bg-[--ink]` or similar.
6. **Commit:** `feat(frontend): upgrade Tailwind 3 → 4`.

**Risk: low-medium.** Pure UI surface. Rollback = `git revert`. Time
estimate: 4-8 hours including visual sweep.

**Codemod limitations:** `@tailwindcss/upgrade` handles ~80% of cases.
Known things it misses: custom plugins, dynamic class names built from
template literals, the `prefix` config option (removed in v4 — use CSS
cascade layers instead).

---

### Phase B · React 18 → 19 + Next 14 → 15  *(1-2 days; coupled)*

**Why coupled:** Next 15 is the first version that supports React 19
fully. Doing them as one branch means one set of CI runs, one diff to
review.

**Why before Next 16:** Next 15 introduces *temporary* synchronous
compatibility for `cookies() / headers() / params / searchParams`. Next
16 *removes* that fallback. Going through 15 first means we get the
deprecation warnings (and our codemod runs cleanly) before the strict
enforcement lands.

**Steps:**

1. **Branch off main** (after Phase A is merged): `chore/upgrade-next-15`.
2. **Run the codemod:**
   ```bash
   pnpm dlx @next/codemod@canary upgrade 15
   ```
   This handles:
   - Bumping `next`, `react`, `react-dom` to 15 / 19
   - Adding `await` to `cookies() / headers() / params / searchParams` reads
   - Updating `@types/react` and `@types/react-dom` to 19
   - `<Link legacyBehavior>` → modern Link API where applicable
3. **Manual review** of files the codemod touched. Especially:
   - `src/lib/auth.tsx` — async API reads in the auth context
   - Any page reading `searchParams` (e.g. `src/app/page.tsx` for the `?job=` highlight)
   - All `params: { id: string }` Page/Layout types should now be `params: Promise<{ id: string }>`
4. **Update Radix:** All Radix primitives in `src/components/ui/` may
   emit React 19 `forwardRef` warnings if their internal types weren't
   bumped. Run `pnpm up @radix-ui/*` to pick up React 19-compatible
   versions (current `1.1.x` releases support both 18 and 19).
5. **Replace `forwardRef` with ref-as-prop** *(optional, can wait):*
   React 19 supports passing `ref` as a regular prop on function
   components. The shadcn primitives I re-skinned all use `forwardRef` —
   that still works in 19, but new components should prefer ref-as-prop.
6. **Test:**
   ```bash
   pnpm typecheck
   pnpm build
   pnpm dev
   ```
   Walk every authenticated route, especially:
   - `/jobs/[id]` — params + searchParams + WebSocket
   - `/login` and `/register` — useEffect + forms
   - `/library` — file uploads via FormData
7. **Commit:** `feat(frontend): upgrade Next 14 → 15, React 18 → 19`.

**Risk: medium.** The codemod handles 70% of cases; the rest is reading
diffs carefully. Two known gotchas:
- **Hydration mismatches** from Date/locale formatting are stricter in 19
- **Suspense behaviour** changes for client components reading
  third-party data — check the WebSocket-driven dashboard

Time estimate: 1-2 days including thorough smoke test.

---

### Phase C · Next 15 → 16  *(1 day; smaller)*

**Why a separate phase:** Next 16's breaking changes are smaller than
14→15 (which had async APIs as a temp behaviour); 15→16 makes those APIs
strict and renames `middleware.ts` to `proxy.ts`. By doing it in
isolation, the diff is reviewable and rollback is trivial.

**Steps:**

1. **Branch:** `chore/upgrade-next-16`.
2. **Run the codemod:**
   ```bash
   pnpm dlx @next/codemod@canary upgrade latest
   ```
   This handles:
   - Bumping to 16.x
   - Removing the temporary sync compatibility on async APIs
     (everything *must* be `await`-ed now)
   - Renaming `middleware.ts` → `proxy.ts` (we don't have one — skip)
   - Removing `experimental_ppr` exports (we don't use them — skip)
3. **Update `next.config.{js,ts}`:**
   - `experimental.turbopack.*` → top-level `turbopack.*`
   - Drop the `eslint` config block (Next 16 removed it; ESLint runs directly)
   - Migrate `images.domains` → `images.remotePatterns` (we use it for `API_URL`-prefixed image rendering — check)
4. **Run `next typegen` once** to generate the new `PageProps<>` /
   `LayoutProps<>` / `RouteContext<>` global helpers.
5. **Update `package.json` scripts:**
   ```json
   "dev": "next dev --turbopack",
   "build": "next build --turbopack",
   "lint": "eslint"
   ```
   *(Turbopack is now default but the explicit flag is harmless and
   makes intent clear.)*
6. **`next lint` is removed.** Replace any `npm run lint` references
   with `eslint .` directly. Bump `eslint-config-next` to 16.x —
   that pulls in the React 19 + Next 16 rule set.
7. **Test as in Phase B.** Special attention to:
   - `images.minimumCacheTTL` is now 4 hours (was 60s) — check if the
     generated avatar / brand logo previews look stale
   - Local image query strings now require `images.localPatterns` config
     — the `?v=` cache-busting in `<img src={`${API_URL}${...}?v=...`}>`
     paths will need updating
8. **Commit:** `feat(frontend): upgrade Next 15 → 16, Turbopack default`.

**Risk: low-medium.** Codemod handles structural changes; the failures
are mostly from the strict async APIs + image config tightening. Time
estimate: 6-10 hours.

---

### Phase D · ESLint 8 → 9  *(half-day; optional)*

This is a tooling-only upgrade. ESLint 9 dropped the legacy `.eslintrc`
config in favour of flat config (`eslint.config.mjs`). `eslint-config-next`
16 ships flat-config support out of the box, so most of the work is
moving rules from `.eslintrc.json` to `eslint.config.mjs`.

**Steps:**

1. Run the codemod (Next ships one):
   ```bash
   pnpm dlx @next/codemod@canary next-lint-to-eslint-cli .
   ```
2. Manually convert `.eslintrc.json` → `eslint.config.mjs` (template in `marketing/`).
3. Bump `eslint` to 9.x.
4. Drop unused rules.

**Risk: very low.** Time: 2-4 hours.

---

### Phase E · Optional polish *(ongoing)*

- **Adopt React Compiler.** Currently opt-in. Enable in `next.config`
  with `reactCompiler: true` after monitoring builds for memoisation
  issues. ~5 min config change; net win for any page with deep render
  trees.
- **Adopt `<ViewTransition>` for the `/jobs/[id]` reveal** the same way
  marketing's `/work` drawer uses it.
- **Migrate marketing's font set into a shared package** if the studio
  surface count grows past 2.
- **Cleanup:** drop the brand SVG files in `frontend/public/brand/`
  now that we render the procedural `<DriftMark />` everywhere.

---

## 4 · Sequence summary

```
main (today)
  │
  ├─ feat/ui-refresh (this session) ─────────► merge first
  │
  └─ chore/upgrade-tailwind-4         ──┐
        │                                 │
        └─ chore/upgrade-next-15      ──┤
              │                           │
              └─ chore/upgrade-next-16  ┤   ← do these strictly in order
                    │                     │
                    └─ chore/upgrade-eslint-9
```

Each branch should be merged to `main` and tagged before the next one
opens. CI must be green at every merge — no batched upgrades.

**Total elapsed time** (assuming one engineer, no overlap):
- Phase 0: 0.5 day
- Phase A: 1 day
- Phase B: 2 days
- Phase C: 1 day
- Phase D: 0.5 day
- **≈ 5 working days end-to-end.**

---

## 5 · What I would *not* do

- **Don't upgrade everything at once.** The codemods exist precisely
  because each major has its own concerns; collapsing them into one
  branch makes regressions impossible to attribute.
- **Don't migrate Radix or shadcn primitives** during the framework
  upgrade. They're already up-to-date and React-19-compatible.
- **Don't pin Lenis / GSAP / R3F into `frontend/`.** If a page in
  `frontend/` ever needs scroll choreography, copy from `marketing/`
  selectively — apps want native scroll for fast review.
- **Don't bump `tailwindcss-animate`** unless the Tailwind 4 codemod
  reports it. Some shadcn primitives import its keyframes — if the
  successor `tw-animate-css` provides the same keyframe names, it's a
  drop-in. Otherwise, accept the rewrite cost.

---

*End of plan.*
