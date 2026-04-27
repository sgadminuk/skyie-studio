"use client";

import { useEffect, useRef, useState } from "react";
import { DriftMark } from "@/components/brand/DriftMark";
import { substrateStatements } from "@/content/home";
import { mapRange } from "@/lib/motion";
import { useMotionEnabled } from "@/components/system/MotionPolicyProvider";

/**
 * §2 Substrate — background-only section (per brief §4.1).
 *
 * The Drift field expands to fill the viewport at low opacity.
 * Foreground text scrolls through it: 4 short statements, each appearing
 * as the previous one fades.
 *
 * The brief says use scroll-driven CSS, not JS. We use a single rAF
 * subscription that maps scroll progress through the section to the
 * "active statement index" — that's effectively scroll-driven, single-
 * source-of-truth, and avoids 4× IntersectionObservers.
 */

export function Substrate() {
  const motionEnabled = useMotionEnabled();
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!motionEnabled) {
      setActive(0);
      return;
    }
    const el = sectionRef.current;
    if (!el) return;

    let raf = 0;
    let dirty = true;
    const onScroll = () => {
      dirty = true;
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      raf = 0;
      if (!dirty) return;
      dirty = false;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const total = rect.height - vh;
      const traversed = -rect.top;
      const t = mapRange(traversed, 0, Math.max(total, 1), 0, 1);
      const idx = Math.min(
        substrateStatements.length - 1,
        Math.floor(t * substrateStatements.length),
      );
      setActive(idx);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [motionEnabled]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="substrate-heading"
      className="relative h-[400vh]"
      data-cv="auto"
    >
      <h2 id="substrate-heading" className="sr-only">
        Substrate
      </h2>

      {/* Sticky inner — the field stays put while statements cycle */}
      <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden">
        {/* Drift field background, 4% opacity per brief */}
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center text-ink"
          style={{ opacity: 0.04 }}
        >
          <DriftMark
            size="min(180vw, 2400px)"
            speed={9}
            style={{ minWidth: "100vw", minHeight: "100vh" }}
          />
        </div>

        {/* Foreground statements */}
        <ol className="relative px-[var(--gutter)] max-w-[60rem] flex flex-col gap-0 m-0 p-0 list-none">
          {substrateStatements.map((s, i) => (
            <li
              key={i}
              className="absolute inset-0 flex items-center transition-opacity"
              style={{
                opacity: active === i ? 1 : 0,
                transitionDuration: "560ms",
                transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                pointerEvents: active === i ? "auto" : "none",
              }}
              aria-current={active === i ? "step" : undefined}
            >
              <span className="text-h1 text-ink/95 leading-[1.05] max-w-[24ch]">{s}</span>
            </li>
          ))}
        </ol>

        {/* Index marker */}
        <span
          aria-hidden
          className="absolute bottom-8 right-[var(--gutter)] text-mono-sm text-ink/40 tabular-nums"
        >
          §02 · {String(active + 1).padStart(2, "0")} / {String(substrateStatements.length).padStart(2, "0")}
        </span>
      </div>
    </section>
  );
}
