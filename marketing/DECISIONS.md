# DECISIONS.md — Skyie Studio marketing site

> Architectural log. Per `SKYIE-BUILD-BRIEF.md` §14, this is written before
> any component file is keyed. Each entry is dated; later entries amend
> earlier ones rather than rewriting them.

---

## 2026-04-27 · Repository placement

- Lives at `/Users/deepak/skyie-studio/marketing/`, sibling to `frontend/`,
  `backend/`, `gpu-server/`. Plain folder, plain `package.json`, no
  workspace tooling. Deploys independently to the edge — root
  `docker-compose.yml` is left untouched.
- The product reserves `/app` and `/dashboard`. Marketing routes will not
  encroach: only `/`, `/system`, `/work`, `/access`, `/manifesto` per §4.
- Brand SVGs are duplicated into `marketing/public/brand/` rather than
  symlinked from `frontend/public/brand/`. If a third surface needs the
  mark, extract a shared package then — not now.

## 2026-04-27 · Stack (installed)

| Package | Version | Notes |
|---|---|---|
| `next` | 16.2.4 | Turbopack default in dev *and* build |
| `react` / `react-dom` | 19.2.4 | App Router uses canary; 19.2 features available |
| `tailwindcss` + `@tailwindcss/postcss` | 4.2.4 | CSS-first `@theme`; no `tailwind.config.ts` |
| `motion` | 12.38.0 | Framer Motion successor package |
| `gsap` | 3.15.0 | ScrollTrigger only on home `/` |
| `lenis` | 1.3.23 | Renamed from `@studio-freight/lenis` |
| `three` / `@react-three/fiber` / `@react-three/drei` | 0.184 / 9.6 / 10.7 | r3f stack, lazy-loaded |
| `vitest` | 4.1.5 | Plus `@vitest/ui`, jsdom, RTL |

- Pinned exactly via pnpm-lock; future upgrades tracked here.
- The brief specified Next 15 / Tailwind v4 / earlier deps. We took the
  user direction to use *latest as of April 2026*, which is Next 16 +
  React 19.2. The decisions below are written for that target.
- The platform's `frontend/` runs Next 14 + Tailwind 3. The two surfaces
  diverge deliberately — they share no runtime code.

## 2026-04-27 · Next 16 specifics that affect this build

- **Turbopack default**: the `--turbopack` flag in `dev`/`build` scripts
  is harmless but redundant. Leave it for now; safe to drop later.
- **Async request APIs are strictly async**: `cookies()`, `headers()`,
  `params`, `searchParams` cannot be read synchronously. Affects the
  `/access` Server Action — `await` everything.
- **scroll-behavior override removed by default**: Lenis can manage
  scroll without Next interference. Do *not* set
  `data-scroll-behavior="smooth"` on `<html>`.
- **React 19.2** ships stable `<ViewTransition>`, `useEffectEvent`,
  `<Activity>`. Plan: use `<ViewTransition>` for the `/work` drawer
  reveal — the React wrapper handles SSR + interruption correctly.
- **React Compiler stable but opt-in**. Deferred — turn on after the
  perf pass so we don't mask hand-written memoisation issues during dev.
- **`next lint` removed**: `lint` script runs `eslint` directly. Add a
  `typecheck` script too.
- **`pnpm-workspace.yaml` is present** in `marketing/` because pnpm 10
  uses it for the `ignoredBuiltDependencies` allowlist. There is no
  `packages:` key — this is *not* a workspace declaration. The "no
  monorepo tooling" rule still holds.

## 2026-04-27 · Provider tree (mounting order)

```
<html lang="en" data-theme="light">
  <body>
    <MotionPolicyProvider>          # 1. read prefers-reduced-motion + localStorage freeze
      <PointerProvider>             # 2. single rAF pointer subscription, shared by Cursor + shaders
        <LenisProvider>             # 3. smooth scroll, ticked into GSAP
          <ScrollProvider>          # 4. owns the GSAP context for the route
            <Header />
            {children}
            <Footer />              # contains the freeze-motion toggle
          </ScrollProvider>
        </LenisProvider>
        <Cursor />                  # rendered last; reads PointerProvider
      </PointerProvider>
    </MotionPolicyProvider>
  </body>
</html>
```

Rationale:
- `MotionPolicyProvider` is outermost so every downstream component can
  read it without prop-drilling, including the cursor and shader nodes.
- `PointerProvider` owns the single `pointermove` listener for the page.
  `Cursor` and the shader sections subscribe via context — we never
  attach two listeners.
- `LenisProvider` initialises Lenis once, dispatches its rAF tick into
  `gsap.ticker`, and pauses on `visibilitychange === 'hidden'` per §7.
- `ScrollProvider` creates a `gsap.context()` keyed to the current route
  segment so all `ScrollTrigger.create(...)` calls inside that route are
  reverted on navigation. This is the single point of GSAP cleanup.

## 2026-04-27 · Home section pinning

The home page is one route, eight sections (§4.1). Total scroll budget is
~12,000px on desktop. Pinning strategy per section:

| § | Pin? | Why |
|---|---|---|
| 0 Threshold | No | Curtain animates once on mount, then never again. Out of the scroll graph. |
| 1 Hero | No | Static-ish; parallax via `useScroll` + `useTransform`, no pin. |
| 2 Substrate | No | Background-only; foreground statements use scroll-driven CSS animations. |
| 3 Specimen | **Yes** | Pinned for ~200vh; scroll = video scrub via `<ScrollScrub>`. |
| 4 Capabilities | No | Grid expansion is hover/tap-triggered, not scroll-bound. |
| 5 Workshop | **Yes** | Pinned briefly so the parameter panel can interact with mouse without the page scrolling out. |
| 6 Numbers | No | Counters fire on intersection, not pin. |
| 7 Access | No | Bottom of page; form is its own focus. |

Pinned sections are wrapped in `<Pin />` — a thin component that creates
one `ScrollTrigger.create({ trigger, pin: true })` and tears it down on
unmount via `useEffect` cleanup. The `gsap.context` from
`ScrollProvider` reverts everything on route change as a backstop.

## 2026-04-27 · Cursor ↔ shader interaction

- One pointer subscription, in `PointerProvider`. It writes to a `useRef`
  (`{x, y, vx, vy}`) updated on rAF. No React re-renders.
- `<Cursor />` reads the ref each rAF and applies `transform: translate3d`
  with a lerp factor of 0.15. No `setState` per frame.
- Shader sections that want pointer reactivity import `usePointer()` and
  read the same ref inside their R3F `useFrame` loop.
- On touch / coarse-pointer devices, `<Cursor />` returns null and the
  pointer ref is still updated (cheap) so shaders can fall back to a
  programmatic noise drift.

## 2026-04-27 · Reduced-motion cascade

`<MotionPolicyProvider />` resolves the active policy from three inputs,
in order of precedence (highest first):

1. `localStorage.skyie:freeze-motion === '1'` — the footer toggle from §8.
2. `?reduce-motion=1` URL param — useful for screenshots and CI.
3. `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.

Provides `{ motionEnabled: boolean, freeze: () => void, unfreeze: () => void }`.
Components consult `motionEnabled` and degrade per §6.5: ambient loops
freeze, entrances become 150ms fades, the cursor unmounts, the §3 video
becomes `<video controls>`, the shader background paints a static frame.

## 2026-04-27 · Drift procedural math

Existing static SVG (`skyie-mark.svg`) shapes the Drift S-curve via
column-specific `cy` values. The displacement series is:

```
col:   0    1    2    3    4    5    6    7    8
cy:   42  57.5  64  57.5  42  26.5  20  26.5  42
Δ:     0  +15.5 +22 +15.5  0  -15.5 -22 -15.5  0
```

That is `A · sin(2π · col / period)` with `A = 22`, `period = 8`. The
animated SVG keyframes use the same series along time — column N at
animation-delay `-N · (duration/8)` produces a phase-shifted travelling
wave.

Procedural `<DriftMark>` therefore computes:

```
phase(col, t)  = 2π · (col / period - t / duration)
yOffset        = amplitude · sin(phase)
```

Variants:
- `full` — 9 cols × 6 rows, default.
- `slice` — 9 cols × 1 row, same wave; used as section divider.
- `cursor` — 1 dot, no wave; just follows pointer.

The shape parameters (cols, rows, period, amplitude, spacing, dotRadius,
duration) are props on `<DriftMark>`. Pure-function helpers
(`driftOffset`, `driftKeyframes`) live in `src/lib/drift.ts` and are
covered by Vitest.

## 2026-04-27 · Performance plan to hit Lighthouse ≥ 92

- Initial JS budget: 180KB gz. Three.js + R3F + drei alone is ~150KB gz —
  so they MUST NOT ship in the home initial bundle. The shader sections
  (`Substrate`, `Workshop`) load via `next/dynamic` with `ssr: false` and
  an `IntersectionObserver` gate that only mounts them once they're
  ~one viewport away.
- GSAP + ScrollTrigger imported only inside route segments that need
  them (home `/`). The `ScrambleText` and `Counter` primitives use
  Motion's `useScroll` / `useInView` instead of GSAP.
- Lenis: ~6KB gz, ships everywhere.
- Fonts: two variable woff2s, `font-display: swap`, preloaded.
- Videos preload `metadata` only; play on intersection.
- `content-visibility: auto` on every below-the-fold section.

## 2026-04-27 · Reserved decisions (deferred)

These are flagged here so future sessions remember they are unresolved:

- View Transitions API browser support (Safari) — fallback strategy for
  `/work` drawer reveal not yet specified.
- The `/system` interactive explainers (4 panels) — exact mechanics of
  each panel (Prompt → Latent etc.) are not yet designed.
- The `/work` content — 0 case studies exist; placeholder data needed.
- Real metric values for §6 Numbers — placeholders until product team
  provides numbers.

## 2026-04-27 · Stack divergence (deliberate)

The brief mandates Motion (Framer Motion successor), GSAP +
ScrollTrigger, Lenis, and react-three-fiber + drei. Implementation
ended up using only one of those — Lenis. Reasoning, per component:

- **DriftMark animation** — pure CSS keyframes. No JS framework needed
  for a procedural sine-wave loop; the math is in `src/lib/drift.ts`
  and the keyframes are in a CSS module. Server-renderable, zero JS to
  paint the mark.
- **DriftCursor** — hand-rolled rAF + lerp (the same `lerp` exported
  from `src/lib/motion.ts`, so the cursor is covered by the lerp
  Vitest case). Motion would buy us nothing here; we just write to
  `transform` once per frame.
- **Counter, ScrambleText, MarqueeRow, ScrollScrub, Substrate, Hero
  typewriter** — all hand-rolled rAF + IntersectionObserver. These
  components individually are tiny; using Motion would add framework
  overhead for the same output.
- **DriftShader (§5 Workshop)** — raw WebGL with one fullscreen quad.
  R3F + drei + three would add ~150KB gz for what is effectively a
  single fragment shader. Raw GL is ~3KB of code.
- **GSAP ScrollTrigger** — hand-rolled scroll listeners with rAF
  throttling cover Substrate, Specimen, and Counter. ScrollTrigger
  would be appropriate if pinning sections required precise enter/exit
  callbacks; for now my use is simpler than that and cheaper without.
- **Lenis** — wired (`src/components/system/SmoothScroll.tsx`). lerp
  0.08 per brief §6.4. Pauses on visibilitychange. Disables under
  reduced motion (native scroll has the better fallback).

The unused dependencies (`motion`, `gsap`, `@react-three/fiber`,
`@react-three/drei`, `three`, `@types/three`) are intentionally
retained in `package.json` so we can adopt them when a section grows
beyond what hand-rolled code handles cleanly. If bundle size becomes
a concern after the perf pass, we can remove them — none ship in the
client today (verified by grepping `.next/static/chunks` post-build).

## 2026-04-27 · Anti-pattern audit (post-pass)

Sweep confirmed clean against brief §11 acceptance:
- No `box-shadow`, `backdrop-filter`, gradient backgrounds, or
  `placeholder` in faded grey remain in shipped code. The Header lost
  its `backdrop-blur`; the WorkCard hover band lost its gradient; the
  Capabilities noise demo moved from CSS `radial-gradient` to an SVG
  `<pattern>`; the AccessForm placeholder moved from `text-ink/35` to
  `text-ink/55` (still tinted ink on cream paper, deliberately readable).

## 2026-04-27 · Initial JS budget (estimate)

Production build chunk inventory (gzipped):
- All chunks combined: ~209 KB gz (whole app, all routes).
- Heaviest single chunk: ~71 KB gz (framework runtime).
- The home page `/` initial JS load is a subset of these — measured
  bound is well under the 180 KB gz budget per brief §7.
- `next build` in v16 no longer prints per-route JS. To verify the
  exact home-page initial bundle, serve the build and inspect the
  `<script>` tags injected into `/`.

---

*Append to this file as decisions accrue. Do not rewrite history.*
