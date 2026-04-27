/**
 * /access content. Three plans, one column each.
 *
 * No "Most Popular" badge (per §4.4 and the anti-pattern list §12).
 * The middle plan inverts to ink on hover; the others stay paper.
 *
 * Pricing displayed in mono, large. Currency suffix as caption.
 * The brief uses sober plan names — these are technical, not marketing.
 */

export type AccessPlan = {
  id: string;
  numeral: string;
  name: string;
  /** Annual price for display; the studio bills monthly internally. */
  priceMonthly: number;
  /** Currency code for Intl.NumberFormat. */
  currency: string;
  /** One-line technical statement. Not a tagline. */
  description: string;
  /** What's actually included. Each line is a fact. */
  inclusions: string[];
  /** Submit copy. */
  cta: string;
};

export const accessPlans: AccessPlan[] = [
  {
    id: "reference",
    numeral: "01",
    name: "Reference",
    priceMonthly: 19,
    currency: "USD",
    description:
      "For reviewing reference frames and short test renders. Single seat. Standard queue.",
    inclusions: [
      "Up to 200 generated seconds per month",
      "Output up to 1080p · 24/30 fps",
      "Standard queue · median wait 4 minutes",
      "Render history retained 30 days",
    ],
    cta: "Request access",
  },
  {
    id: "workshop",
    numeral: "02",
    name: "Workshop",
    priceMonthly: 89,
    currency: "USD",
    description:
      "Daily generation at full bandwidth. Single seat. Priority queue.",
    inclusions: [
      "Unlimited generated seconds",
      "Output up to 4K · 24/30/60/120 fps",
      "Priority queue · median wait 40 seconds",
      "Render history retained 365 days",
      "Seed re-render with prompt diff overlay",
    ],
    cta: "Request access",
  },
  {
    id: "atelier",
    numeral: "03",
    name: "Atelier",
    priceMonthly: 480,
    currency: "USD",
    description:
      "Multi-seat studios. Dedicated GPU allocation. Direct line to engineering.",
    inclusions: [
      "Up to 10 seats · seat-level audit log",
      "Dedicated GPU pool · no shared queue",
      "Custom model fine-tuning on request",
      "Render history retained without expiry",
      "Direct messaging channel with the studio",
    ],
    cta: "Request access",
  },
];

/** Single-sentence preamble at the top of /access. */
export const accessLede =
  "Three configurations of the same workshop. Pricing is monthly. There is no annual lock-in. There is no free tier; the studio runs hardware that is not free to operate.";
