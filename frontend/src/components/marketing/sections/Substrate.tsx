"use client";

import { useEffect, useRef, useState } from "react";
import { DriftMark } from "@/components/skyie/DriftMark";
import { substrateStatements } from "@/content/marketing/home";
import { mapRange } from "@/lib/skyie/motion";
import { useMotionEnabled } from "@/components/skyie/MotionPolicyProvider";

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

      {/* Sticky inner — the field stays put while statements cycle.
          100svh (small viewport height) keeps the inner pinned to the
          *visible* viewport on mobile, so the address bar can't push
          content off the bottom. */}
      <div
        className="sticky top-0 flex items-center justify-center overflow-hidden"
        style={{ height: "100svh" }}
      >
        {/* Drift field background, 4% opacity per brief */}
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center text-ink"
          style={{ opacity: 0.04 }}
        >
          <DriftMark
            size="min(180vw, 2400px)"
            speed={9}
            style={{ minWidth: "100vw", minHeight: "100svh" }}
          />
        </div>

        {/* Foreground statements — sized so even the longest line wraps
            to 3 lines tops on every viewport we support */}
        <ol
          className="relative w-full px-[var(--gutter)] py-[clamp(64px,10vh,128px)] m-0 list-none flex items-center justify-center"
          style={{ minHeight: "100svh" }}
        >
          {substrateStatements.map((s, i) => (
            <li
              key={i}
              className="absolute inset-0 flex items-center justify-center px-[var(--gutter)] py-[clamp(64px,10vh,128px)] transition-opacity"
              style={{
                opacity: active === i ? 1 : 0,
                transitionDuration: "560ms",
                transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                pointerEvents: active === i ? "auto" : "none",
              }}
              aria-current={active === i ? "step" : undefined}
            >
              <span
                className="text-ink/95 leading-[1.1] max-w-[28ch]"
                style={{
                  // Smaller than text-h1 so the longest 68-char statement
                  // wraps to ≤3 lines and never overflows 100svh.
                  fontSize: "clamp(1.75rem, 3vw + 1rem, 4rem)",
                  fontWeight: 380,
                  letterSpacing: "-0.03em",
                }}
              >
                {s}
              </span>
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
