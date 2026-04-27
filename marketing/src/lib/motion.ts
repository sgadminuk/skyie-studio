/**
 * Skyie Studio · motion constants
 *
 * Per brief §6. These are the only easings and durations the site uses.
 * Components must import from this module — never hand-write a curve.
 */

/** Cubic-bezier control points · use `bezier(...ease.out)` with Motion. */
export const ease = {
  /** Primary entrance / reveal curve. */
  out: [0.16, 1, 0.3, 1] as const,
  /** Section transitions. */
  inOut: [0.83, 0, 0.17, 1] as const,
  /** Playful — buttons, micro-interactions. */
  spring: [0.34, 1.56, 0.64, 1] as const,
  /** Sine-like — the Drift loop, ambient breathing. */
  drift: [0.45, 0, 0.55, 1] as const,
} as const;

/** Durations in seconds (Motion convention). Multiply by 1000 for CSS. */
export const dur = {
  instant: 0.12,
  quick: 0.32,
  base: 0.56,
  long: 0.96,
  epic: 1.6,
} as const;

/** Default sibling stagger (seconds). Scale up to `staggerWide`, down to `staggerTight`. */
export const stagger = {
  tight: 0.02,
  default: 0.04,
  wide: 0.08,
} as const;

/**
 * Lerp toward a target. Pure function — testable.
 * `factor` should be 0..1; `0.15` is the cursor's default chase weight.
 */
export function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

/** Clamp x to [min, max]. */
export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

/**
 * Map `value` from input range to output range.
 * Used by the §3 Specimen scrub to bind scroll position to video time.
 *
 * - When `value <= inMin`, returns `outMin`.
 * - When `value >= inMax`, returns `outMax`.
 * - Linear in between.
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return outMin + (outMax - outMin) * t;
}

/** Smoothstep — clamped Hermite. Useful for entrance progress curves. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
