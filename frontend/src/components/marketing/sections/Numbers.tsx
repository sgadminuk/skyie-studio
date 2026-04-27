"use client";

import { useEffect, useRef, useState } from "react";
import { Counter } from "@/components/marketing/motion/Counter";
import { numbersMetrics } from "@/content/marketing/home";
import { useMotionEnabled } from "@/components/skyie/MotionPolicyProvider";

/**
 * §6 Numbers — pure typography section (per brief §4.1).
 *
 * Four metrics, rendered at 30vw type size. Counter ticks 0 → value;
 * simultaneously the variable-font weight axis tweens 100 → 380.
 *
 * The weight tween is per-metric. We mount an IntersectionObserver per
 * metric and animate font-variation-settings inline.
 */

export function Numbers() {
  return (
    <section
      aria-labelledby="numbers-heading"
      className="px-[var(--gutter)] py-[clamp(96px,18vh,240px)] flex flex-col gap-[clamp(48px,8vh,128px)]"
      data-cv="auto"
    >
      <header className="flex items-baseline gap-4">
        <span className="text-mono-sm text-ink/40">§06</span>
        <h2 id="numbers-heading" className="text-h2">
          Numbers.
        </h2>
      </header>

      <ul className="flex flex-col gap-[clamp(40px,6vh,96px)] list-none p-0">
        {numbersMetrics.map((m, i) => (
          <li
            key={m.id}
            className={`flex flex-col gap-3 ${
              i % 2 === 0 ? "items-start" : "items-end text-right"
            }`}
          >
            <WeightTweenedNumber
              value={m.value}
              fractionDigits={m.fractionDigits}
              suffix={m.suffix}
            />
            <span className="text-mono-sm text-ink/55 max-w-[40ch]">{m.caption}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A Counter where the surrounding span tweens its `wght` axis from
 * 100 → 380 over the same duration. Visual weight gain matches the
 * count-up. Per brief §4.1 §6.
 */
function WeightTweenedNumber({
  value,
  fractionDigits,
  suffix,
}: {
  value: number;
  fractionDigits?: number;
  suffix?: string;
}) {
  const motionEnabled = useMotionEnabled();
  const ref = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || armed) return;
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
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    const el = ref.current;
    if (!el) return;
    if (!motionEnabled) {
      el.style.fontVariationSettings = `"wght" 380`;
      return;
    }
    const start = performance.now();
    const dur = 1600;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min((now - start) / dur, 1);
      // smoothstep for parity with Counter
      const eased = t * t * (3 - 2 * t);
      const w = 100 + (380 - 100) * eased;
      el.style.fontVariationSettings = `"wght" ${w.toFixed(0)}`;
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [armed, motionEnabled]);

  return (
    <span
      ref={ref}
      className="block leading-[0.86] tracking-[-0.04em] text-ink"
      style={{
        fontSize: "clamp(96px, 30vw, 480px)",
        fontVariationSettings: `"wght" 100`,
      }}
    >
      <Counter value={value} fractionDigits={fractionDigits} suffix={suffix} />
    </span>
  );
}
