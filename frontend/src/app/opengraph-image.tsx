import { ImageResponse } from "next/og";
import { defaultDriftConfig, dotPosition } from "@/lib/drift";

/**
 * /opengraph-image · 1200×630 PNG for social previews. Renders the
 * static Drift mark + brand text on the paper-coloured background.
 *
 * Used as the default OG/Twitter image for every route unless a route
 * defines its own `app/[route]/opengraph-image.tsx`.
 */

export const alt = "Skyie Studio · synthesizing motion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
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
          background: "#F4F2EC", // paper
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          fontFamily: "Helvetica, Arial, sans-serif",
          color: "#0A0A0A",
        }}
      >
        {/* Top row · mark + meta */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <svg viewBox={`0 0 ${vbW} ${vbH}`} width="240" height="190">
            <g fill="#0A0A0A">
              {dots.map((d, i) => (
                <circle key={i} cx={d.cx} cy={d.cy} r={cfg.dotRadius} />
              ))}
            </g>
          </svg>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 6,
              fontSize: 16,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(10,10,10,0.55)",
            }}
          >
            <span>Skyie Studio</span>
            <span>est. 2026 · Rochester / SF</span>
          </div>
        </div>

        {/* Bottom · headline */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <span
            style={{
              fontSize: 130,
              lineHeight: 0.92,
              letterSpacing: "-0.04em",
              fontWeight: 500,
            }}
          >
            A workshop for synthesizing motion.
          </span>
          <span
            style={{
              fontSize: 22,
              letterSpacing: "0.06em",
              color: "rgba(10,10,10,0.6)",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            skyie.studio · 24 / 30 / 60 / 120 fps
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
