"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { useMotionEnabled } from "./MotionPolicyProvider";

/**
 * Lenis smooth-scroll wrapper. Per brief §6.4: lerp 0.08, no smoother.
 * Pauses when document is hidden (per §7), and disables under reduced
 * motion — native scroll has the better fallback story.
 *
 * Mounted at the root via Providers. Effects-only — renders nothing.
 */
export function SmoothScroll() {
  const motionEnabled = useMotionEnabled();

  useEffect(() => {
    if (!motionEnabled) return;

    const lenis = new Lenis({
      lerp: 0.08,
      // Default: native scroll on mobile, JS scroll on desktop. Lenis decides.
    });

    let raf = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onVisibility = () => {
      if (document.hidden) {
        lenis.stop();
      } else {
        lenis.start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      lenis.destroy();
    };
  }, [motionEnabled]);

  return null;
}
