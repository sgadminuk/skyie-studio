"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionEnabled } from "@/components/skyie/MotionPolicyProvider";

/**
 * <ScrambleText /> — each character cycles through random monospace
 * glyphs at 60fps for ~600ms before resolving to its final character.
 * Stagger per character. Triggers when scrolled into view.
 *
 * Per brief §5.3.
 */

export type ScrambleTextProps = {
  /** The final text to resolve to. */
  text: string;
  /** Cycle duration per character (seconds). Default 0.6. */
  duration?: number;
  /** Stagger between characters (seconds). Default 0.04 (= 40ms, motion default). */
  stagger?: number;
  /** Glyph alphabet. Default a mono-flavoured set. */
  glyphs?: string;
  /** Trigger on view (default) or on mount. */
  trigger?: "view" | "mount";
  /** Render as another element. Default `<span>`. */
  as?: "span" | "h1" | "h2" | "h3" | "p" | "div";
  className?: string;
};

const DEFAULT_GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*+=<>?/\\|";

export function ScrambleText({
  text,
  duration = 0.6,
  stagger = 0.04,
  glyphs = DEFAULT_GLYPHS,
  trigger = "view",
  as = "span",
  className,
}: ScrambleTextProps) {
  const motionEnabled = useMotionEnabled();
  const ref = useRef<HTMLElement>(null);
  const [display, setDisplay] = useState<string>(text);
  const [armed, setArmed] = useState(trigger === "mount");

  // Snap to final text on text change so the value is correct outside of view.
  useEffect(() => setDisplay(text), [text]);

  useEffect(() => {
    if (trigger !== "view" || armed) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setArmed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [trigger, armed]);

  useEffect(() => {
    if (!armed || !motionEnabled) {
      setDisplay(text);
      return;
    }
    const start = performance.now();
    const len = text.length;
    const totalMs = (duration + stagger * (len - 1)) * 1000;
    const charDur = duration * 1000;
    const stagMs = stagger * 1000;
    let raf = 0;

    const step = (now: number) => {
      const elapsed = now - start;
      let next = "";
      for (let i = 0; i < len; i++) {
        const charStart = i * stagMs;
        const charElapsed = elapsed - charStart;
        const finalChar = text[i] ?? " ";
        if (charElapsed <= 0) {
          // not yet started — random glyph (or space)
          next += finalChar === " " ? " " : randomFrom(glyphs);
        } else if (charElapsed >= charDur) {
          next += finalChar;
        } else {
          // mid-cycle — random glyph (or space stays space)
          next += finalChar === " " ? " " : randomFrom(glyphs);
        }
      }
      setDisplay(next);
      if (elapsed < totalMs) raf = requestAnimationFrame(step);
      else setDisplay(text);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [armed, motionEnabled, text, duration, stagger, glyphs]);

  const Tag = as as "span";
  return (
    <Tag ref={ref as React.Ref<HTMLSpanElement>} className={className} aria-label={text}>
      {display}
    </Tag>
  );
}

function randomFrom(s: string): string {
  return s[Math.floor(Math.random() * s.length)] ?? " ";
}
