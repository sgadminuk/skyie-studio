import { describe, expect, it } from "vitest";
import {
  columnDelay,
  defaultDriftConfig,
  dotPosition,
  driftKeyframes,
  driftOffset,
} from "./drift";

describe("driftOffset", () => {
  // The static SVG bakes these exact offsets per column at tNorm=0.
  // Reproducing them here is the unit test for the procedural curve.
  const expected = [
    { col: 0, dy: 0 },
    { col: 1, dy: 15.5563 },
    { col: 2, dy: 22 },
    { col: 3, dy: 15.5563 },
    { col: 4, dy: 0 },
    { col: 5, dy: -15.5563 },
    { col: 6, dy: -22 },
    { col: 7, dy: -15.5563 },
    { col: 8, dy: 0 },
  ];

  it.each(expected)(
    "matches the static SVG S-curve at column $col (Δy ≈ $dy)",
    ({ col, dy }) => {
      const got = driftOffset(col, 0, defaultDriftConfig);
      expect(got).toBeCloseTo(dy, 3);
    },
  );

  it("loops with period 8 columns at tNorm=0", () => {
    expect(driftOffset(0, 0, defaultDriftConfig)).toBeCloseTo(
      driftOffset(8, 0, defaultDriftConfig),
      6,
    );
  });

  it("phase-shifts cleanly with tNorm — col(N, t) === col(N+1, t + 1/period)", () => {
    const t = 0.2;
    const a = driftOffset(2, t, defaultDriftConfig);
    const b = driftOffset(3, t + 1 / defaultDriftConfig.period, defaultDriftConfig);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("dotPosition", () => {
  it("places col=4 row=0 on the centre baseline (dy=0)", () => {
    const { cx, cy } = dotPosition(4, 0, defaultDriftConfig);
    // cx = spacing/2 + 4 * spacing = 20 + 160 = 180
    expect(cx).toBe(180);
    // cy_baseline = dotRadius + amplitude = 28; dy(col=4) ≈ 0 (sin floating-point noise)
    expect(cy).toBeCloseTo(28, 6);
  });

  it("displaces col=2 row=0 down by 22px (matching the static mark)", () => {
    const baseline = dotPosition(4, 0, defaultDriftConfig).cy;
    const c2 = dotPosition(2, 0, defaultDriftConfig).cy;
    expect(c2 - baseline).toBeCloseTo(22, 3);
  });

  it("rows space evenly per row regardless of column", () => {
    const a = dotPosition(0, 0, defaultDriftConfig).cy;
    const b = dotPosition(0, 1, defaultDriftConfig).cy;
    expect(b - a).toBe(defaultDriftConfig.rowSpacing);
  });
});

describe("columnDelay", () => {
  it("returns 0 for column 0", () => {
    // -0 is fine; assert via toBeCloseTo rather than strict equality.
    expect(columnDelay(0, defaultDriftConfig)).toBeCloseTo(0, 6);
  });

  it("returns -duration/columns for column 1 (matches animated SVG)", () => {
    const expected = -defaultDriftConfig.duration / defaultDriftConfig.columns;
    expect(columnDelay(1, defaultDriftConfig)).toBeCloseTo(expected, 6);
  });

  it("wraps modulo columns", () => {
    expect(columnDelay(9, defaultDriftConfig)).toBeCloseTo(
      columnDelay(0, defaultDriftConfig),
      6,
    );
  });
});

describe("driftKeyframes", () => {
  it("emits 9 keyframes (8 steps + loopback)", () => {
    expect(driftKeyframes(defaultDriftConfig)).toHaveLength(9);
  });

  it("starts and ends at y=0 (loop continuity)", () => {
    const k = driftKeyframes(defaultDriftConfig);
    expect(k[0]?.y).toBeCloseTo(0, 6);
    expect(k.at(-1)?.y).toBeCloseTo(0, 6);
  });

  it("hits ±amplitude at quarter and three-quarter points", () => {
    const k = driftKeyframes(defaultDriftConfig);
    // After negation: step 2 (offset 0.25) sin = 1, so y = -22 (visually upward)
    expect(k[2]?.y).toBeCloseTo(-22, 3);
    // step 6 (offset 0.75) sin = -1, so y = +22 (visually downward)
    expect(k[6]?.y).toBeCloseTo(22, 3);
  });
});
