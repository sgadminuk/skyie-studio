import { ImageResponse } from "next/og";
import { defaultDriftConfig, dotPosition } from "@/lib/skyie/drift";

/**
 * /icon · favicon. 32×32 PNG generated from the Drift mark at build /
 * edge time. Static positions (no animation — favicons are still images).
 *
 * Next 14 supports app/icon.tsx via next/og's ImageResponse since 13.3.
 * Same composition as the marketing site — paper-on-ink so a tiny tab
 * favicon still reads at glance.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
        <svg viewBox={`0 0 ${vbW} ${vbH}`} width="28" height="28">
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
