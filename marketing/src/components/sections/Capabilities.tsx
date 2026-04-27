"use client";

import { useEffect, useRef, useState } from "react";
import { capabilities, type Capability } from "@/content/home";
import { DriftMark } from "@/components/brand/DriftMark";
import { useMotionEnabled } from "@/components/system/MotionPolicyProvider";

/**
 * §4 Capabilities — 4×4 grid (per brief §4.1).
 *
 * On hover/focus, the cell expands in-place to fill the grid for ~1.6s,
 * runs a tiny demo, then collapses back. Other cells dim during expansion.
 * Touch: tap to expand, tap outside to collapse.
 *
 * The expansion is implemented with `position: relative` cells and an
 * `position: absolute` overlay anchored to the cell. We use `inset` 0 on
 * the overlay and grow the cell's grid-area via column/row spans.
 *
 * Reduced motion: cells stay collapsed; tapping shows demo without animation.
 */

export function Capabilities() {
  const motionEnabled = useMotionEnabled();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  /**
   * Hover handlers live on the <li>, NOT the <button> — mouseenter /
   * mouseleave do not bubble for child-to-child transitions, so moving
   * the cursor across descendants of the cell does not fire spurious
   * leave events. (The previous implementation put handlers on the
   * button and used `transform: scale(2)` on the overlay; the moment
   * the overlay covered the button, mouseleave fired on the button and
   * collapsed → mouseenter on the now-revealed button → flicker loop.)
   *
   * No 1.6s auto-collapse timer either — the cursor's presence is the
   * lifecycle. Leaving the cell collapses; entering expands.
   */
  const open = (id: string) => setExpandedId(id);
  const close = () => setExpandedId(null);
  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  // Click outside collapses (touch path)
  useEffect(() => {
    if (!expandedId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!sectionRef.current?.contains(t)) setExpandedId(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [expandedId]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="caps-heading"
      className="px-[var(--gutter)] py-[clamp(64px,12vh,160px)] flex flex-col gap-10"
      data-cv="auto"
    >
      <header className="flex items-baseline gap-4">
        <span className="text-mono-sm text-ink/40">§04</span>
        <h2 id="caps-heading" className="text-h2">
          Capabilities.
        </h2>
      </header>

      <ul
        role="list"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-ink/15"
      >
        {capabilities.map((c) => {
          const isExpanded = expandedId === c.id;
          const isDimmed = expandedId !== null && !isExpanded;
          return (
            <li
              key={c.id}
              className={[
                "relative bg-paper p-5 min-h-[180px] flex flex-col justify-between",
                "transition-[opacity,grid-column,grid-row] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                isExpanded ? "z-10 col-span-2 row-span-2 min-h-[280px]" : "",
                isDimmed ? "opacity-30" : "opacity-100",
              ].join(" ")}
              onMouseEnter={() => motionEnabled && open(c.id)}
              onMouseLeave={() => motionEnabled && close()}
            >
              <button
                type="button"
                className="absolute inset-0 cursor-pointer text-left p-5 flex flex-col justify-between"
                onFocus={() => motionEnabled && open(c.id)}
                onBlur={() => motionEnabled && close()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(c.id);
                }}
                aria-expanded={isExpanded}
                aria-label={`${c.title}: ${c.blurb}`}
                data-cursor="ring"
              >
                <span className="text-mono-sm text-ink/40">{c.numeral}</span>
                <div className="flex flex-col gap-2">
                  <span className="text-h3 text-ink">{c.title}</span>
                  <span className="text-mono-sm text-ink/70">{c.blurb}</span>
                </div>
              </button>

              {/* Demo overlay — only renders for the expanded cell. The
                  cell already grew via grid-span, so the overlay simply
                  fills it. No transform tricks. */}
              {isExpanded ? (
                <div
                  className="absolute inset-0 bg-paper border border-ink p-6 flex flex-col gap-4 overflow-hidden pointer-events-none"
                  aria-hidden
                >
                  <span className="text-mono-sm text-ink/40">{c.numeral}</span>
                  <span className="text-h3 text-ink">{c.title}</span>
                  <span className="text-mono-sm text-ink/70 max-w-[42ch]">
                    {c.blurb}
                  </span>
                  <div className="flex-1 flex items-center justify-center">
                    <CapabilityDemo demo={c.demo} />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-mono-sm text-ink/45">
        Hover or focus a cell. Cells dim while another expands; touch users can
        tap to expand and tap outside to collapse.
      </p>
    </section>
  );
}

/**
 * Tiny in-cell demo per capability. Each demo is intentionally cheap —
 * a procedural Drift, a marquee dot, a wave bar, etc. No video files.
 */
function CapabilityDemo({ demo }: { demo: Capability["demo"] }) {
  if (demo === "drift") return <DriftMark size={120} speed={3} />;
  if (demo === "scrub") return <DriftMark size={120} speed={6} variant="slice" />;
  if (demo === "wave") {
    return (
      <div className="flex gap-1 items-end h-20">
        {Array.from({ length: 20 }, (_, i) => (
          <span
            key={i}
            className="w-1 bg-ink"
            style={{
              height: "100%",
              transformOrigin: "bottom",
              animation: `wave-bar 1.4s cubic-bezier(0.45, 0, 0.55, 1) ${i * 0.06}s infinite`,
            }}
          />
        ))}
        <style>{`
          @keyframes wave-bar {
            0%, 100% { transform: scaleY(0.2); }
            50% { transform: scaleY(1); }
          }
        `}</style>
      </div>
    );
  }
  if (demo === "noise") {
    // Procedural dot field via SVG <pattern> — no CSS gradients.
    return (
      <svg
        viewBox="0 0 128 80"
        className="w-32 h-20 text-ink"
        aria-hidden
        style={{ animation: "noise-pan 3s linear infinite" }}
      >
        <defs>
          <pattern id="noise-cap-a" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.9" fill="currentColor" />
          </pattern>
          <pattern id="noise-cap-b" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="4.5" cy="4.5" r="0.7" fill="currentColor" opacity="0.7" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#noise-cap-a)" />
        <rect width="100%" height="100%" fill="url(#noise-cap-b)" />
        <style>{`
          @keyframes noise-pan {
            0%   { transform: translate3d(0, 0, 0); }
            100% { transform: translate3d(-8px, 6px, 0); }
          }
        `}</style>
      </svg>
    );
  }
  if (demo === "type") {
    return (
      <span
        className="text-h2"
        style={{
          fontVariationSettings: '"wght" 100',
          animation: "weight-pulse 2.4s cubic-bezier(0.45, 0, 0.55, 1) infinite",
        }}
      >
        Aa
        <style>{`
          @keyframes weight-pulse {
            0%, 100% { font-variation-settings: "wght" 100; }
            50% { font-variation-settings: "wght" 700; }
          }
        `}</style>
      </span>
    );
  }
  // still
  return (
    <DriftMark size={100} variant="full" animated={false} className="text-ink/70" />
  );
}
