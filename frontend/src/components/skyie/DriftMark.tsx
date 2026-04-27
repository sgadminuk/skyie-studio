import type { CSSProperties, SVGAttributes } from "react";
import { columnDelay, defaultDriftConfig, driftViewBox, type DriftConfig } from "@/lib/skyie/drift";
import styles from "./DriftMark.module.css";

/**
 * <DriftMark /> — Skyie Studio's identity mark, rendered procedurally.
 *
 * The mark is a 9×6 dot field disrupted by a sine wave (per brief §3.1).
 * - `variant="full"`   → the full mark, 9 columns × 6 rows.
 * - `variant="slice"`  → a single horizontal row, used as section divider.
 * - `variant="cursor"` → a single dot, used by <Cursor />.
 *
 * The component is a server component: no JavaScript is required for the
 * mark to appear. The Drift loop is pure CSS animation; pauseOnHover is
 * implemented as a `:hover` rule, not a JS event handler.
 *
 * `prefers-reduced-motion: reduce` freezes the animation in CSS — the
 * mark continues to render statically.
 *
 * Per brief §5.1.
 */

export type DriftMarkVariant = "full" | "slice" | "cursor";

type DriftMarkOwnProps = {
  /** CSS width. Number = pixels; string = passed through. Default `100%`. */
  size?: number | string;
  /** Run the Drift loop. Default `true`. Static when `false`. */
  animated?: boolean;
  /** `full` (9×6), `slice` (9×1), `cursor` (1×1). Default `full`. */
  variant?: DriftMarkVariant;
  /** Stroke / fill colour. Default `currentColor`. */
  colour?: string;
  /** Loop duration in seconds. Default 4. */
  speed?: number;
  /** Pause the loop on hover. Default `false`. */
  pauseOnHover?: boolean;
  /** Override individual config knobs (advanced). */
  config?: Partial<DriftConfig>;
};

export type DriftMarkProps = DriftMarkOwnProps &
  Omit<SVGAttributes<SVGSVGElement>, keyof DriftMarkOwnProps>;

export function DriftMark({
  size = "100%",
  animated = true,
  variant = "full",
  colour = "currentColor",
  speed = 4,
  pauseOnHover = false,
  config: configOverride,
  className,
  style,
  ...rest
}: DriftMarkProps) {
  // Variant-specific shape: slice = 1 row, cursor = 1 col × 1 row.
  const variantConfig: Partial<DriftConfig> =
    variant === "slice"
      ? { rows: 1 }
      : variant === "cursor"
        ? { rows: 1, columns: 1, amplitude: 0 }
        : {};

  const config: DriftConfig = {
    ...defaultDriftConfig,
    ...variantConfig,
    ...configOverride,
    duration: speed,
  };

  const { width: vbW, height: vbH } = driftViewBox(config);

  const dots: Array<{
    cx: number;
    cy: number;
    r: number;
    col: number;
    row: number;
  }> = [];

  for (let col = 0; col < config.columns; col++) {
    for (let row = 0; row < config.rows; row++) {
      const cx = config.spacing / 2 + col * config.spacing;
      // Animated mode: render columns flat — the per-column animation
      // produces the S-curve via translateY. Static mode: bake the
      // S-curve into cy. (Matches skyie-mark.svg vs skyie-mark-animated.svg.)
      const baseY = config.dotRadius + config.amplitude + row * config.rowSpacing;
      const cy = animated
        ? baseY
        : baseY + driftOffsetUnsafe(col, config.amplitude, config.period);
      dots.push({ cx, cy, r: config.dotRadius, col, row });
    }
  }

  // Group dots by column so per-column animation can be scoped to <g>.
  const grouped = new Map<number, typeof dots>();
  for (const d of dots) {
    const list = grouped.get(d.col) ?? [];
    list.push(d);
    grouped.set(d.col, list);
  }

  const widthAttr = typeof size === "number" ? `${size}px` : size;

  return (
    <svg
      role="img"
      aria-label="Skyie Studio"
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={widthAttr}
      preserveAspectRatio="xMidYMid meet"
      className={[
        styles.root,
        pauseOnHover ? styles.pauseOnHover : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      {...rest}
    >
      <g fill={colour}>
        {Array.from(grouped.entries()).map(([col, colDots]) => {
          const colStyle: CSSProperties & Record<string, string> = {
            "--drift-delay": `${columnDelay(col, config)}s`,
            "--drift-amplitude": `${config.amplitude}px`,
            "--drift-duration": `${config.duration}s`,
          };
          return (
            <g
              key={col}
              className={`${styles.col} ${animated ? styles.colAnimated : ""}`}
              style={colStyle}
            >
              {colDots.map((d) => (
                <circle key={`${d.col}-${d.row}`} cx={d.cx} cy={d.cy} r={d.r} />
              ))}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/**
 * Tiny inline duplicate of `driftOffset` so we can call it without
 * importing the typed signature into a tight render loop. Kept private.
 */
function driftOffsetUnsafe(col: number, amplitude: number, period: number) {
  return amplitude * Math.sin((2 * Math.PI * col) / period);
}
