"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionEnabled } from "./MotionPolicyProvider";

/**
 * Live UTC clock to the millisecond. Mono. Updates via rAF (per brief §5.6).
 * Suspends when document is hidden. Renders without time on the server to
 * avoid hydration mismatch.
 */
export function TimeStamp({ className }: { className?: string }) {
  const [text, setText] = useState<string>("--:--:--.---");
  const motionEnabled = useMotionEnabled();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    const tick = () => {
      if (!active) return;
      setText(formatUtc(new Date()));
      rafRef.current = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    if (motionEnabled) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      // Reduced motion: tick at 1Hz so the clock is still useful but inert
      const id = window.setInterval(() => setText(formatUtc(new Date())), 1000);
      return () => window.clearInterval(id);
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [motionEnabled]);

  return (
    <time
      dateTime={text}
      className={`text-mono-sm tabular-nums ${className ?? ""}`}
      aria-label="UTC time"
    >
      {text}
    </time>
  );
}

function formatUtc(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}
