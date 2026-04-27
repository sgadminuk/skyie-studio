/**
 * /home content module.
 *
 * Per brief §11: copy lives in src/content/*.ts, never hardcoded in
 * components. Per §13: tone is technical statement, observed fact,
 * restrained claim. Avoid marketing verbs.
 */

/* §1 Hero -------------------------------------------------------------- */

/**
 * The hero phrase rotates every ~8s, re-typewritten character by
 * character. Four verbs, four direct objects, four three-word imperatives.
 */
export const heroPhrases = [
  "Generate light.",
  "Compose time.",
  "Author motion.",
  "Render thought.",
] as const;

/**
 * Single sub-line beneath the hero phrase, in mono. The dots are en-spaces
 * (·) per the brief's typesetting.
 */
export const heroByline =
  "Skyie Studio · in-house video generation · est. 2026 · Rochester / SF";

/**
 * Right-edge instrument readout. Each row is a (label, value) pair.
 * Values that are functions render dynamically; strings render literally.
 *
 * The TimeStamp slot is identified by `kind: "clock"` so the section can
 * mount a real <TimeStamp /> there.
 */
export type HeroLedgerRow =
  | { kind: "clock"; label: string }
  | { kind: "literal"; label: string; value: string };

export const heroLedger: HeroLedgerRow[] = [
  { kind: "clock", label: "UTC" },
  { kind: "literal", label: "Queue", value: "04 / 64" },
  { kind: "literal", label: "Model", value: "drift-2.4.1" },
  { kind: "literal", label: "Region", value: "us-west-2 · 43.1°N / 77.6°W" },
];

/* §2 Substrate ---------------------------------------------------------- */

/**
 * Four short statements that appear sequentially as the section is
 * scrolled. Each replaces the last; the Drift field hangs behind them.
 */
export const substrateStatements = [
  "The substrate is dot, time, and constraint.",
  "Every frame is a deliberate sample of a learned distribution.",
  "Determinism is a property of the system, not a feature of a release.",
  "The studio publishes the prompt, the seed, the model, and the time.",
];

/* §3 Specimen ----------------------------------------------------------- */

/**
 * Three live, scroll-scrubbable clips. Until real renders are wired up,
 * we ship placeholder mp4s; the captions are the production contract.
 */
export type SpecimenClip = {
  id: string;
  /** Short title for ARIA + the eyebrow. */
  title: string;
  /** Path to the video in /public/video. May be missing in dev. */
  src: string;
  /** Optional poster frame. */
  poster?: string;
  /** Caption rows — each renders as a key/value pair in mono. */
  caption: Array<{ k: string; v: string }>;
};

export const specimenClips: SpecimenClip[] = [
  {
    id: "rain-tower",
    title: "Rain over a brutalist tower",
    src: "/video/rain-tower.mp4",
    caption: [
      { k: "Prompt", v: "rain falling against a concrete tower at dusk, slow drift" },
      { k: "Model", v: "drift-2.4.1" },
      { k: "Seed", v: "0x4f9e2c10" },
      { k: "Render", v: "00:42.318 · 96 frames @ 24fps" },
    ],
  },
  {
    id: "kelp-forest",
    title: "Kelp forest, 60 fps",
    src: "/video/kelp.mp4",
    caption: [
      { k: "Prompt", v: "kelp forest swaying with a slow current, sunbeams from above" },
      { k: "Model", v: "drift-2.4.1" },
      { k: "Seed", v: "0x88ab2317" },
      { k: "Render", v: "01:13.082 · 240 frames @ 60fps" },
    ],
  },
  {
    id: "city-grid",
    title: "City grid, dawn flyover",
    src: "/video/city-grid.mp4",
    caption: [
      { k: "Prompt", v: "low aerial flyover of a city grid at first light, no clouds" },
      { k: "Model", v: "drift-2.4.0" },
      { k: "Seed", v: "0x12fe6ad0" },
      { k: "Render", v: "00:31.604 · 124 frames @ 30fps" },
    ],
  },
];

/* §4 Capabilities ------------------------------------------------------- */

/**
 * 16 cells in a 4×4 grid. Each cell hosts an in-place demo when expanded.
 * The `demo` field is the kind of content the cell produces; the actual
 * video / canvas is rendered by the section component.
 */
export type Capability = {
  id: string;
  numeral: string;
  title: string;
  /** One-line technical claim. */
  blurb: string;
  /** What the in-cell demo shows. Renderer keys off this string. */
  demo: "drift" | "scrub" | "wave" | "noise" | "type" | "still";
};

export const capabilities: Capability[] = [
  { id: "t2v",     numeral: "01", title: "Text → Video",      blurb: "A prompt becomes a 24-, 30-, 60-, or 120-fps clip.",       demo: "drift" },
  { id: "i2v",     numeral: "02", title: "Image → Video",     blurb: "A still becomes a sequence consistent with its source.",   demo: "scrub" },
  { id: "motion",  numeral: "03", title: "Motion transfer",   blurb: "Borrow the kinematics of one clip; replace the surface.",  demo: "wave"  },
  { id: "audio",   numeral: "04", title: "Audio-reactive",    blurb: "Render frames that resolve a waveform's gesture.",         demo: "wave"  },
  { id: "extend",  numeral: "05", title: "Frame extension",   blurb: "Continue a clip forward or backward in time.",             demo: "scrub" },
  { id: "inpaint", numeral: "06", title: "In-frame inpaint",  blurb: "Replace a region of every frame consistently.",            demo: "noise" },
  { id: "style",   numeral: "07", title: "Style transfer",    blurb: "Re-render existing footage under a new substrate.",        demo: "drift" },
  { id: "depth",   numeral: "08", title: "Depth-aware",       blurb: "Each frame ships with a parallax-correct depth map.",      demo: "noise" },
  { id: "loop",    numeral: "09", title: "Seamless loops",    blurb: "Clips that resolve to their own first frame.",             demo: "wave"  },
  { id: "alpha",   numeral: "10", title: "Alpha mattes",      blurb: "Transparent video, no chroma key required.",               demo: "still" },
  { id: "type",    numeral: "11", title: "Typesetting",       blurb: "Variable-axis kinetic type at any frame rate.",            demo: "type"  },
  { id: "scene",   numeral: "12", title: "Scene composition", blurb: "Multi-prompt blocking with named subjects.",               demo: "still" },
  { id: "fps",     numeral: "13", title: "Source frame rate", blurb: "Output at the source rate, not the panel's preferred.",   demo: "scrub" },
  { id: "ratio",   numeral: "14", title: "Any aspect ratio",  blurb: "1:1 through 32:9, generated at native resolution.",        demo: "still" },
  { id: "diff",    numeral: "15", title: "Seed diffing",      blurb: "Re-render with a prompt diff and inspect the delta.",      demo: "drift" },
  { id: "audit",   numeral: "16", title: "Audit metadata",    blurb: "Every output ships its prompt, model, seed, render time.", demo: "type"  },
];

/* §5 Workshop ----------------------------------------------------------- */

/**
 * Four sliders that drive the live Drift fragment shader. Ranges are
 * chosen so the visual stays interesting at every position.
 */
export type WorkshopParameter = {
  id: "motion" | "density" | "palette" | "time";
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  initial: number;
};

export const workshopParameters: WorkshopParameter[] = [
  { id: "motion",  label: "Motion",  unit: "amp",  min: 0,  max: 1,    step: 0.01, initial: 0.5  },
  { id: "density", label: "Density", unit: "px",   min: 8,  max: 64,   step: 1,    initial: 24   },
  { id: "palette", label: "Palette", unit: "hue",  min: 0,  max: 360,  step: 1,    initial: 240  }, // signal-blue
  { id: "time",    label: "Time",    unit: "sec",  min: 0.5, max: 12,  step: 0.1,  initial: 4    },
];

/* §6 Numbers ----------------------------------------------------------- */

export type Metric = {
  id: string;
  /** The number that ticks up. */
  value: number;
  /** Optional fraction digits (default 0). */
  fractionDigits?: number;
  /** Pre-/post-fix; e.g. " ms", "k". */
  suffix?: string;
  /** Subordinate label below the number. */
  caption: string;
};

export const numbersMetrics: Metric[] = [
  { id: "clips",  value: 184_372,                 caption: "Clips rendered to date" },
  { id: "ttf",    value: 38.6, fractionDigits: 1, suffix: " s", caption: "Median time to first frame" },
  { id: "models", value: 7,                       caption: "Models in production" },
  { id: "users",  value: 1_204,                   caption: "Beta users · seat allocation" },
];

/* §7 Access (CTA) ------------------------------------------------------- */

/**
 * One-sentence preamble above the home email capture. Distinct from
 * /access's lede: this is the elevator-summary, not the plan-level pitch.
 */
export const homeAccessLede =
  "If the studio's bandwidth has not yet been claimed, leave an address. The studio will reply with a code.";
