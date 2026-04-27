import { ImageResponse } from "next/og";
import { defaultDriftConfig, dotPosition } from "@/lib/skyie/drift";

/**
 * /apple-icon · 180×180. Same composition as /icon at home-screen size.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const cfg = defaultDriftConfig;
  const dots: Array<{ cx: number; cy: number }> = [];
  for (let row = 0; row < cfg.rows; row++) {
    for (let col = 0; col < cfg.columns; col++) {
      dots.push(dotPosition(col, row, cfg));
    }
  }
  const vbW = cfg.spacing * cfg.columns;
  const vbH = cfg.rowSpacing * cfg.rows + 2 * cfg.amplitude;

  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          background: "#0A0A0A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg viewBox={`0 0 ${vbW} ${vbH}`} width="148" height="148">
          <g fill="#F4F2EC">
            {dots.map((d, i) => (
              <circle key={i} cx={d.cx} cy={d.cy} r={cfg.dotRadius} />
            ))}
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
