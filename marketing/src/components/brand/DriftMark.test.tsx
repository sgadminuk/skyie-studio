import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DriftMark } from "./DriftMark";

describe("<DriftMark />", () => {
  it("renders the full mark with 9×6 dots by default", () => {
    const { container } = render(<DriftMark />);
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(54);
  });

  it("renders 9 column groups", () => {
    const { container } = render(<DriftMark />);
    const cols = container.querySelectorAll("g[style*='--drift-delay']");
    expect(cols).toHaveLength(9);
  });

  it("renders the slice variant as 9×1", () => {
    const { container } = render(<DriftMark variant="slice" />);
    expect(container.querySelectorAll("circle")).toHaveLength(9);
  });

  it("renders the cursor variant as a single dot", () => {
    const { container } = render(<DriftMark variant="cursor" />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("bakes the S-curve into cy when animated=false", () => {
    const { container } = render(<DriftMark animated={false} />);
    const dots = Array.from(container.querySelectorAll("circle"));
    // Column 2 row 0 should sit at amplitude+offset baseline + 22 (peak displacement)
    const c2r0 = dots.find((d) => d.getAttribute("cx") === "100");
    expect(c2r0).toBeDefined();
    const cy = Number(c2r0!.getAttribute("cy"));
    // dotRadius(6) + amplitude(22) + 0 + 22 = 50
    expect(cy).toBeCloseTo(50, 3);
  });

  it("renders all dots flat when animated=true (S-curve via animation)", () => {
    const { container } = render(<DriftMark animated={true} />);
    const dots = Array.from(container.querySelectorAll("circle"));
    // Column 2 row 0 (cx=100) and column 4 row 0 (cx=180) should share cy
    const c2r0 = dots.find((d) => d.getAttribute("cx") === "100");
    const c4r0 = dots.find((d) => d.getAttribute("cx") === "180");
    expect(c2r0?.getAttribute("cy")).toBe(c4r0?.getAttribute("cy"));
  });

  it("propagates the speed prop into --drift-duration", () => {
    const { container } = render(<DriftMark speed={2} />);
    const firstCol = container.querySelector("g[style*='--drift-duration']");
    expect(firstCol?.getAttribute("style")).toContain("--drift-duration: 2s");
  });

  it("applies the colour prop to the fill group", () => {
    const { container } = render(<DriftMark colour="#ff0000" />);
    const fillGroup = container.querySelector("g[fill]");
    expect(fillGroup?.getAttribute("fill")).toBe("#ff0000");
  });

  it("exposes role=img with the brand name as accessible label", () => {
    const { getByRole } = render(<DriftMark />);
    expect(getByRole("img", { name: "Skyie Studio" })).toBeInTheDocument();
  });
});
