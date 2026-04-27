"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { mapRange } from "@/lib/skyie/motion";
import { useMotionEnabled } from "@/components/skyie/MotionPolicyProvider";

/**
 * <ScrollScrub /> — wraps a <video> and binds its currentTime to the
 * scroll position of the wrapper element relative to the viewport.
 *
 * - When the wrapper top hits the viewport bottom (entering)  → t = 0.
 * - When the wrapper bottom hits the viewport top (leaving)   → t = duration.
 * - Linear in between.
 *
 * `prefers-reduced-motion` (or freeze toggle) ⇒ render <video controls>
 * instead of scrubbing — per brief §6.5.
 *
 * Per brief §5.7.
 */

export type ScrollScrubProps = {
  src: string;
  poster?: string;
  /** Aspect ratio for the wrapper. Default 16/9. */
  aspect?: number;
  /** Render captions / prompt below — passed through. */
  children?: ReactNode;
  className?: string;
};

export function ScrollScrub({ src, poster, aspect = 16 / 9, children, className }: ScrollScrubProps) {
  const motionEnabled = useMotionEnabled();
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!wrap || !video) return;
    if (!motionEnabled) {
      // Reduced motion: native controls, no scroll binding.
      video.controls = true;
      return;
    }
    video.controls = false;

    let frame = 0;
    let dirty = true;

    const onScroll = () => {
      dirty = true;
      if (frame === 0) frame = requestAnimationFrame(tick);
    };

    const tick = () => {
      frame = 0;
      if (!dirty) return;
      dirty = false;

      const dur = video.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;

      const rect = wrap.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // Progress 0..1 from "top hits bottom of viewport" to "bottom hits top".
      const total = rect.height + vh;
      const traversed = vh - rect.top;
      const t = mapRange(traversed, 0, total, 0, 1);

      video.currentTime = t * dur;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [motionEnabled]);

  return (
    <div ref={wrapRef} className={className}>
      <div style={{ aspectRatio: aspect, width: "100%" }}>
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          preload="metadata"
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
      {children}
    </div>
  );
}
