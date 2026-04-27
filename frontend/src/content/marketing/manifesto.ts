/**
 * /manifesto · long-form brand statement.
 *
 * Tone (per brief §13): 1970s manufacturing manual · museum wall label ·
 * particle-physics FAQ. Avoid: "unleash", "powered by", "game-changing",
 * "seamlessly", "effortlessly".
 *
 * Structure: each section has a numeral, a heading, an array of paragraphs
 * (which may include footnote references via {fn: n}), an optional aside
 * (right-margin on desktop, inline italic on mobile), and a slice of the
 * Drift mark at the top.
 */

export type ManifestoNode =
  | string
  | { fn: number };

export type ManifestoParagraph = ManifestoNode[];

export type ManifestoSection = {
  id: string;
  numeral: string;
  heading: string;
  body: ManifestoParagraph[];
  aside?: string;
};

export type ManifestoFootnote = {
  n: number;
  text: string;
};

export const manifestoLede =
  "A workshop for synthesizing motion. This document records the reasons the studio exists in this form — why these tools, why this restraint, why this typeface set in this size at this width.";

export const manifestoSections: ManifestoSection[] = [
  {
    id: "the-workshop",
    numeral: "I",
    heading: "The workshop.",
    body: [
      [
        "Skyie Studio is in-house apparatus. The platform renders 24-, 30-, 60-, and 120-frame-per-second video from a single prompt, and is operated by people who write the model code, the orchestration, and the marketing site you are currently reading.",
      ],
      [
        "There is no separation between the engineers and the artisans. The studio does not procure tooling from elsewhere; the studio is the tooling.",
        { fn: 1 },
      ],
    ],
    aside:
      "The studio operates from Rochester and San Francisco. There are no offices in either city; the studio is a private network and a small set of GPUs.",
  },
  {
    id: "synthesis",
    numeral: "II",
    heading: "On synthesis.",
    body: [
      [
        'We are not "generating" video in the sense of conjuring it from nothing. We are synthesising it: composing a sequence of frames consistent with a description, a seed, and a learned distribution of light.',
      ],
      [
        "The verb matters. To generate is to produce, perhaps casually. To synthesise is to compose under constraint. The constraint is what the studio is interested in.",
      ],
    ],
  },
  {
    id: "frame-rate",
    numeral: "III",
    heading: "Frame rate as material.",
    body: [
      [
        "A 24-frame-per-second video has a different texture than a 60-frame-per-second video, and that texture is not improved by interpolation. It is the material.",
        { fn: 2 },
      ],
      [
        "The studio publishes at the source rate, not at a vendor's preferred display rate. The viewer's panel will resample as needed; the file will not lie about what was rendered.",
      ],
    ],
    aside:
      "The 120 fps option exists because some viewers can see it. We do not cap output to the median panel.",
  },
  {
    id: "determinism",
    numeral: "IV",
    heading: "Determinism is published.",
    body: [
      [
        "Every clip the studio renders carries its prompt, its model version, its seed, and its render time. These are not metadata in the polite sense. They are part of the work, on the same level as the frame data.",
      ],
      [
        "Re-rendering the same prompt with the same seed against the same model yields the same clip, frame for frame. This is a property of the system, not a feature of a release. A clip without these four values is not a Skyie clip.",
        { fn: 3 },
      ],
    ],
  },
  {
    id: "the-mark",
    numeral: "V",
    heading: "On the mark.",
    body: [
      [
        "The mark is a 9 × 6 grid of dots disrupted by a single sine-wave displacement. We call it Drift. It is a logo, but it is also a working diagram of what the system does: a stable substrate, slightly perturbed, repeating.",
      ],
      [
        "The mark is not decorative. It is rendered procedurally in every surface the studio publishes — including this page — so that its shape is verifiable rather than asserted.",
      ],
    ],
  },
  {
    id: "restraint",
    numeral: "VI",
    heading: "Restraint as feature.",
    body: [
      [
        "Several features the studio could ship are deliberately absent. There is no marketplace, no community gallery, no generation credit economy. There is no bot. There is no interpolation toggle that pretends a 24 fps render was a 60 fps render.",
      ],
      [
        "The studio is small. The features are few. The features that exist are intended to remain.",
      ],
    ],
    aside:
      "The footer of every page contains a single toggle: freeze motion. It is the only persistent UI affordance besides navigation.",
  },
];

export const manifestoFootnotes: ManifestoFootnote[] = [
  {
    n: 1,
    text: "There are exceptions. The compute substrate (GPUs, networking, the underlying weights of certain reference models) is procured. The phrase 'the studio is the tooling' is a description of the surface, not the basement.",
  },
  {
    n: 2,
    text: "See: any 24 fps source upscaled by a consumer television to 120 fps. The result is uncanny because the texture has been altered without permission.",
  },
  {
    n: 3,
    text: "Within numerical precision. The studio publishes the precision regime alongside the seed.",
  },
];
