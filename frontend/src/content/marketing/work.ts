/**
 * /work · gallery items.
 *
 * Each item is a render with metadata. The `span` controls the grid
 * footprint (1, 2, or 3 cells). The brief calls for case studies as
 * metadata only — no detail pages — so all fields render in the side
 * drawer instead.
 */

export type WorkItem = {
  id: string;
  title: string;
  /** Slug-style code shown in the drawer. */
  ref: string;
  /** Grid cell footprint. */
  span: 1 | 2 | 3;
  /** Optional explicit row span (defaults to 1). */
  rowSpan?: 1 | 2;
  /** Aspect ratio of the still / video. */
  aspect: "16:9" | "4:3" | "1:1" | "9:16" | "21:9";
  /** Path to the looping clip. May be missing in dev. */
  src: string;
  /** Optional poster (preferred when prefers-reduced-motion). */
  poster?: string;
  /** One-line description for the card hover & drawer summary. */
  blurb: string;
  /** Drawer-only metadata. */
  meta: Array<{ k: string; v: string }>;
  /** Long-form notes shown in the drawer. */
  notes: string[];
};

export const workItems: WorkItem[] = [
  {
    id: "lighthouse-fog",
    ref: "REND-04122-NN",
    title: "Lighthouse, North Atlantic fog",
    span: 2,
    rowSpan: 2,
    aspect: "9:16",
    src: "/video/lighthouse.mp4",
    blurb: "Long-exposure lighthouse beam piercing fog at 60 fps.",
    meta: [
      { k: "Prompt", v: "lighthouse beam through dense fog, slow rotation" },
      { k: "Model",  v: "drift-2.4.0" },
      { k: "Seed",   v: "0x88f0cd92" },
      { k: "Render", v: "01:42.118 · 240 frames @ 60fps" },
      { k: "Aspect", v: "9:16 · 1080×1920" },
    ],
    notes: [
      "First clip rendered with the v2.4 motion-prior. The prior holds the beam stable through the fog noise instead of letting the model drift.",
    ],
  },
  {
    id: "kelp",
    ref: "REND-04207-NN",
    title: "Kelp forest, slow current",
    span: 2,
    aspect: "16:9",
    src: "/video/kelp.mp4",
    blurb: "Sunlit kelp swaying with a slow current; particulate suspended.",
    meta: [
      { k: "Prompt", v: "kelp forest swaying with a slow current, sunbeams from above" },
      { k: "Model",  v: "drift-2.4.1" },
      { k: "Seed",   v: "0x88ab2317" },
      { k: "Render", v: "01:13.082 · 240 frames @ 60fps" },
    ],
    notes: [
      "Used as the §3 Specimen on the home page. Full clip available in the drawer.",
    ],
  },
  {
    id: "rain-tower",
    ref: "REND-04772-NN",
    title: "Rain over a brutalist tower",
    span: 1,
    aspect: "1:1",
    src: "/video/rain-tower.mp4",
    blurb: "Concrete tower under heavy rain at dusk.",
    meta: [
      { k: "Prompt", v: "rain falling against a concrete tower at dusk, slow drift" },
      { k: "Model",  v: "drift-2.4.1" },
      { k: "Seed",   v: "0x4f9e2c10" },
      { k: "Render", v: "00:42.318 · 96 frames @ 24fps" },
    ],
    notes: [
      "Source rate is 24 fps. The shimmer at the top of the tower is not artefact — it's resolved condensation from the prompt seeding.",
    ],
  },
  {
    id: "city-grid",
    ref: "REND-04903-NN",
    title: "Aerial city grid, dawn",
    span: 1,
    aspect: "21:9",
    src: "/video/city-grid.mp4",
    blurb: "Low aerial flyover of a city grid at first light.",
    meta: [
      { k: "Prompt", v: "low aerial flyover of a city grid at first light, no clouds" },
      { k: "Model",  v: "drift-2.4.0" },
      { k: "Seed",   v: "0x12fe6ad0" },
      { k: "Render", v: "00:31.604 · 124 frames @ 30fps" },
    ],
    notes: ["Anamorphic 21:9 framing at native 2520×1080."],
  },
  {
    id: "type-test",
    ref: "REND-05011-NN",
    title: "Variable type, weight axis",
    span: 1,
    aspect: "1:1",
    src: "/video/type-test.mp4",
    blurb: "Kinetic typesetting; weight axis tween on the wght axis.",
    meta: [
      { k: "Prompt", v: 'animate "compose time." across the weight axis 100 → 700' },
      { k: "Model",  v: "drift-2.4.1" },
      { k: "Seed",   v: "0xaa19ee44" },
      { k: "Render", v: "00:08.250 · 198 frames @ 24fps" },
    ],
    notes: ["Test for the §11 Typesetting capability."],
  },
  {
    id: "shoreline",
    ref: "REND-05122-NN",
    title: "Shoreline, dusk",
    span: 2,
    aspect: "21:9",
    src: "/video/shoreline.mp4",
    blurb: "Long sweep of a shoreline at dusk; slow zoom out.",
    meta: [
      { k: "Prompt", v: "shoreline at dusk, slow camera move, sodium light from off-frame" },
      { k: "Model",  v: "drift-2.4.1" },
      { k: "Seed",   v: "0x90c12adf" },
      { k: "Render", v: "01:24.090 · 168 frames @ 24fps" },
    ],
    notes: ["Sodium light is rendered as a colour cast, not a gel."],
  },
  {
    id: "interior",
    ref: "REND-05230-NN",
    title: "Empty interior, raking light",
    span: 1,
    aspect: "4:3",
    src: "/video/interior.mp4",
    blurb: "Empty room, raking afternoon light, dust motes.",
    meta: [
      { k: "Prompt", v: "empty room with raking afternoon light, slow dolly forward" },
      { k: "Model",  v: "drift-2.4.1" },
      { k: "Seed",   v: "0x55d3221b" },
      { k: "Render", v: "00:33.612 · 80 frames @ 24fps" },
    ],
    notes: ["The dust motes are not a particle pass — they are part of the synthesised distribution."],
  },
];
