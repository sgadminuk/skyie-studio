"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMotionEnabled } from "@/components/skyie/MotionPolicyProvider";

/**
 * <MarqueeRow /> — infinite horizontal scroller. Custom; no library.
 *
 * Speed is in pixels-per-second (resolution-independent). Pauses on hover.
 * Reverses while alt-key is held (nice keyboard easter egg per brief §5.4).
 *
 * Two duplicate copies of the children are rendered so the loop is seamless;
 * we measure the first copy and translate the wrapper by its width.
 */

export type MarqueeRowProps = {
  children: ReactNode;
  /** Pixels per second. Default 60. */
  speed?: number;
  /** Pause on hover. Default true. */
  pauseOnHover?: boolean;
  /** Initial direction. Default "left". */
  direction?: "left" | "right";
  /** Alt-key reverses direction. Default true. */
  altReverses?: boolean;
  className?: string;
  /** Extra spacing between repeated copies, px. */
  gap?: number;
};

export function MarqueeRow({
  children,
  speed = 60,
  pauseOnHover = true,
  direction = "left",
  altReverses = true,
  className,
  gap = 48,
}: MarqueeRowProps) {
  const motionEnabled = useMotionEnabled();
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const [reversed, setReversed] = useState(false);
  const [paused, setPaused] = useState(false);

  // Alt-key reverse
  useEffect(() => {
    if (!altReverses) return;
    const onDown = (e: KeyboardEvent) => e.altKey && setReversed(true);
    const onUp = (e: KeyboardEvent) => !e.altKey && setReversed(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [altReverses]);

  // Animation loop
  useEffect(() => {
    if (!motionEnabled) {
      // Reduced motion: park the marquee static at offset 0.
      if (trackRef.current) trackRef.current.style.transform = "translate3d(0, 0, 0)";
      return;
    }

    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!paused) {
        const baseDir = direction === "left" ? -1 : 1;
        const sign = reversed ? -baseDir : baseDir;
        offsetRef.current += speed * dt * sign;

        const measureEl = measureRef.current;
        if (measureEl) {
          const w = measureEl.getBoundingClientRect().width + gap;
          if (w > 0) {
            // Wrap into [-w, 0) regardless of direction
            offsetRef.current = ((offsetRef.current % w) + w) % w;
            const drawn = -((w - offsetRef.current) % w);
            if (trackRef.current) {
              trackRef.current.style.transform = `translate3d(${drawn}px, 0, 0)`;
            }
          }
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [motionEnabled, paused, reversed, direction, speed, gap]);

  const trackStyle: CSSProperties = {
    display: "flex",
    width: "max-content",
    willChange: "transform",
    columnGap: `${gap}px`,
  };

  return (
    <div
      ref={wrapRef}
      className={`overflow-hidden ${className ?? ""}`}
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
      aria-hidden="true"
    >
      <div ref={trackRef} style={trackStyle}>
        <div ref={measureRef} style={{ display: "flex", columnGap: `${gap}px`, flex: "0 0 auto" }}>
          {children}
        </div>
        {/* duplicate copy for seamless wrap */}
        <div style={{ display: "flex", columnGap: `${gap}px`, flex: "0 0 auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
