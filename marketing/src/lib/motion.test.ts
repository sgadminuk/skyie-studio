import { describe, expect, it } from "vitest";
import { clamp, lerp, mapRange, smoothstep } from "./motion";

describe("lerp", () => {
  it("returns the start value at factor 0", () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it("returns the end value at factor 1", () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it("interpolates linearly between start and end", () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(0, 100, 0.25)).toBe(25);
  });

  it("matches the cursor's 0.15 chase factor across 30 frames", () => {
    // Sanity check: the cursor's lerp converges toward target, never overshoots.
    let pos = 0;
    const target = 100;
    for (let frame = 0; frame < 30; frame++) {
      pos = lerp(pos, target, 0.15);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(target);
    }
    // After 30 frames at factor 0.15, we should be ~99% of the way there.
    expect(pos).toBeGreaterThan(99);
    expect(pos).toBeLessThan(100);
  });
});

describe("clamp", () => {
  it("returns x when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it("clamps to lower bound", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });
  it("clamps to upper bound", () => {
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("mapRange", () => {
  it("returns outMin at inMin", () => {
    expect(mapRange(0, 0, 100, 0, 1)).toBe(0);
  });

  it("returns outMax at inMax", () => {
    expect(mapRange(100, 0, 100, 0, 1)).toBe(1);
  });

  it("maps midpoints linearly", () => {
    expect(mapRange(50, 0, 100, 0, 1)).toBe(0.5);
  });

  it("clamps below inMin and above inMax", () => {
    // Used by ScrollScrub: scroll past section start/end shouldn't wrap.
    expect(mapRange(-50, 0, 100, 0, 1)).toBe(0);
    expect(mapRange(150, 0, 100, 0, 1)).toBe(1);
  });

  it("guards against zero-length input ranges", () => {
    expect(mapRange(5, 100, 100, 0, 1)).toBe(0);
  });

  it("supports inverted output ranges", () => {
    expect(mapRange(0, 0, 100, 1, 0)).toBe(1);
    expect(mapRange(100, 0, 100, 1, 0)).toBe(0);
  });
});

describe("smoothstep", () => {
  it("returns 0 below edge0", () => {
    expect(smoothstep(0, 1, -0.5)).toBe(0);
  });
  it("returns 1 above edge1", () => {
    expect(smoothstep(0, 1, 1.5)).toBe(1);
  });
  it("returns 0.5 at the midpoint", () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 6);
  });
  it("is monotonically increasing across the range", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 10; i++) {
      const x = i / 10;
      const y = smoothstep(0, 1, x);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });
});
