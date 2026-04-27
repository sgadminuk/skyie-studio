"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionEnabled } from "../system/MotionPolicyProvider";
import { smoothstep } from "@/lib/motion";

/**
 * <Counter /> — a number that ticks up from 0 to `value` when scrolled
 * into view. Uses Intl.NumberFormat for locale-aware separators.
 *
 * Per brief §5.2.
 */

export type CounterProps = {
  value: number;
  /** Tween duration in seconds. Default 1.6. */
  duration?: number;
  /** Decimal places. Default 0. */
  fractionDigits?: number;
  /** Locale, default browser locale or "en-US". */
  locale?: string;
  /** Suffix appended to the number, e.g. " ms". */
  suffix?: string;
  /** Replace digits with random glyphs while tweening (Scramble mode). */
  scramble?: boolean;
  className?: string;
};

const SCRAMBLE_GLYPHS = "0123456789".split("");

export function Counter({
  value,
  duration = 1.6,
  fractionDigits = 0,
  locale,
  suffix = "",
  scramble = false,
  className,
}: CounterProps) {
  const motionEnabled = useMotionEnabled();
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState<string>(() => format(0, fractionDigits, locale));
  const [hasRun, setHasRun] = useState(false);

  // Tween once when the element first scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el || hasRun) return;

    const formatter = (n: number) => format(n, fractionDigits, locale);

    if (!motionEnabled) {
      // Reduced motion: snap immediately
      setDisplay(formatter(value));
      setHasRun(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || hasRun) return;
        setHasRun(true);
        observer.disconnect();

        const start = performance.now();
        const total = duration * 1000;
        let raf = 0;

        const step = (now: number) => {
          const t = Math.min((now - start) / total, 1);
          const eased = smoothstep(0, 1, t);
          const current = eased * value;

          if (scramble && t < 1) {
            setDisplay(scrambleNumber(current, fractionDigits));
          } else {
            setDisplay(formatter(current));
          }

          if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
      },
      { threshold: 0.5 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration, fractionDigits, locale, motionEnabled, hasRun, scramble]);

  return (
    <span ref={ref} className={`tabular-nums ${className ?? ""}`}>
      {display}
      {suffix}
    </span>
  );
}

function format(n: number, fractionDigits: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

function scrambleNumber(n: number, fractionDigits: number): string {
  const target = format(n, fractionDigits);
  return target
    .split("")
    .map((ch) => (/[0-9]/.test(ch) ? randomGlyph() : ch))
    .join("");
}

function randomGlyph(): string {
  return SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)] ?? "0";
}
