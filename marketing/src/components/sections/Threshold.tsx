"use client";

import { useEffect, useState } from "react";
import { DriftMark } from "@/components/brand/DriftMark";
import { useMotionEnabled } from "@/components/system/MotionPolicyProvider";

/**
 * §0 Threshold — pre-load curtain (per brief §4.1).
 *
 * The curtain covers the page on first visit. The Drift mark assembles
 * dot-by-dot (we approximate by fading the columns in with stagger), then
 * the curtain splits horizontally and pulls offscreen. Once. The
 * sessionStorage flag prevents re-running on internal navigation.
 *
 * Reduced motion: snap straight to the un-curtained state, no animation.
 */

const SEEN_KEY = "skyie:threshold-seen";
const ASSEMBLE_MS = 2400;
const SPLIT_MS = 900;

export function Threshold() {
  const motionEnabled = useMotionEnabled();
  const [phase, setPhase] = useState<"unmounted" | "assembling" | "splitting" | "gone">(
    "unmounted",
  );

  // Decide on mount whether to show.
  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* private mode */
    }

    if (seen || !motionEnabled) {
      setPhase("gone");
      return;
    }

    setPhase("assembling");
    const t1 = window.setTimeout(() => setPhase("splitting"), ASSEMBLE_MS);
    const t2 = window.setTimeout(() => {
      setPhase("gone");
      try {
        window.sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* noop */
      }
    }, ASSEMBLE_MS + SPLIT_MS);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [motionEnabled]);

  if (phase === "unmounted" || phase === "gone") return null;

  const splitting = phase === "splitting";

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[9000] pointer-events-none"
      style={{ contain: "strict" }}
    >
      {/* Top half */}
      <div
        className="absolute inset-x-0 top-0 h-1/2 bg-paper transition-transform"
        style={{
          transform: splitting ? "translate3d(0, -100%, 0)" : "translate3d(0, 0, 0)",
          transitionDuration: `${SPLIT_MS}ms`,
          transitionTimingFunction: "cubic-bezier(0.83, 0, 0.17, 1)",
          willChange: "transform",
        }}
      />
      {/* Bottom half */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 bg-paper transition-transform"
        style={{
          transform: splitting ? "translate3d(0, 100%, 0)" : "translate3d(0, 0, 0)",
          transitionDuration: `${SPLIT_MS}ms`,
          transitionTimingFunction: "cubic-bezier(0.83, 0, 0.17, 1)",
          willChange: "transform",
        }}
      />

      {/* Mark, centred. CSS animates each column in with a stagger that
          mimics dot-by-dot assembly. */}
      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity"
        style={{
          opacity: splitting ? 0 : 1,
          transitionDuration: `${SPLIT_MS}ms`,
        }}
      >
        <div className="threshold-mark text-ink">
          <DriftMark size="min(60vw, 480px)" speed={3} />
        </div>
      </div>

      <style>{`
        .threshold-mark > svg > g > g {
          opacity: 0;
          animation: threshold-fade-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        ${[0, 1, 2, 3, 4, 5, 6, 7, 8]
          .map(
            (i) => `
        .threshold-mark > svg > g > g:nth-child(${i + 1}) {
          animation-delay: ${i * 0.18}s;
        }`,
          )
          .join("\n")}

        @keyframes threshold-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
