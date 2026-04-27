/**
 * Skyie Studio · Drift mark math
 *
 * The static SVG draws an S-curve through a 9-column dot field by giving
 * each column a base `cy` offset:
 *
 *     col:   0    1    2    3    4    5    6    7    8
 *     cy:   42   57.5 64   57.5 42   26.5 20   26.5 42
 *     Δ:     0  +15.5 +22 +15.5  0  -15.5 -22 -15.5  0
 *
 * That's `A · sin(2π · col / period)` with A=22, period=8. The animated
 * SVG uses the same series along time — column N has animation-delay
 * `-N · (duration/8)`, producing a phase-shifted travelling wave.
 *
 * `<DriftMark>` renders the field procedurally so it can be parametrically
 * driven (cols, rows, amplitude, period, speed, variant).
 */

export type DriftConfig = {
  /** Number of dot columns. Default 9. */
  columns: number;
  /** Number of dot rows per column. Default 6. */
  rows: number;
  /** Horizontal spacing between column centres (px in viewBox). Default 40. */
  spacing: number;
  /** Vertical spacing between row centres (px in viewBox). Default 40. */
  rowSpacing: number;
  /** Dot radius (px in viewBox). Default 6. */
  dotRadius: number;
  /** Wave amplitude (px in viewBox). Default 22. */
  amplitude: number;
  /** Period in column units. Default 8 (full sine across cols 0..8). */
  period: number;
  /** Animation duration in seconds. Default 4. */
  duration: number;
};

export const defaultDriftConfig: DriftConfig = {
  columns: 9,
  rows: 6,
  spacing: 40,
  rowSpacing: 40,
  dotRadius: 6,
  amplitude: 22,
  period: 8,
  duration: 4,
};

/**
 * Static y-displacement for column `col` with phase `tNorm` (0..1).
 * `tNorm = 0` reproduces the static S-curve in `skyie-mark.svg`.
 */
export function driftOffset(
  col: number,
  tNorm: number,
  config: Pick<DriftConfig, "amplitude" | "period">,
): number {
  const phase = (2 * Math.PI * col) / config.period - 2 * Math.PI * tNorm;
  return config.amplitude * Math.sin(phase);
}

/** SVG viewBox dimensions for a given config. */
export function driftViewBox(config: DriftConfig): { width: number; height: number } {
  // Mirror the original mark (360 × 284 with 20px outer margin and amplitude breathing room).
  const width = config.spacing * (config.columns - 1) + config.spacing;
  const height =
    config.rowSpacing * (config.rows - 1) + 2 * (config.dotRadius + config.amplitude / 2);
  return { width, height };
}

/**
 * The `cx` and base `cy` for a dot at (col, row), without animation.
 * Mirrors the values in `public/brand/skyie-mark.svg`.
 */
export function dotPosition(
  col: number,
  row: number,
  config: DriftConfig,
): { cx: number; cy: number } {
  const cx = config.spacing / 2 + col * config.spacing;
  const cy =
    config.dotRadius +
    config.amplitude +
    row * config.rowSpacing +
    driftOffset(col, 0, config);
  return { cx, cy };
}

/**
 * Per-column animation-delay (seconds) for the staggered Drift loop.
 * Returns negative values so the wave is mid-cycle on first paint —
 * matching `skyie-mark-animated.svg`.
 */
export function columnDelay(col: number, config: Pick<DriftConfig, "columns" | "duration">): number {
  return -((col % config.columns) * config.duration) / config.columns;
}

/**
 * Build the column-translation keyframes used by the animated mark.
 * Returns `[ {offset, y}, ... ]` for `@keyframes`. Eight steps + the
 * loopback step at offset 1.
 */
export function driftKeyframes(
  config: Pick<DriftConfig, "amplitude">,
): Array<{ offset: number; y: number }> {
  const steps = 8;
  const out: Array<{ offset: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const offset = i / steps;
    const y = -driftOffset(i, 0, { amplitude: config.amplitude, period: steps });
    out.push({ offset, y });
  }
  return out;
}
