"use client";

import { useEffect, useRef, useState } from "react";
import { lerp } from "@/lib/skyie/motion";
import { usePointerRef } from "@/lib/skyie/hooks/usePointer";
import { useMotionEnabled } from "@/components/skyie/MotionPolicyProvider";

/**
 * <DriftCursor /> — the custom cursor.
 *
 * Single 8px dot with 0.15 lerp factor, growing to a 24px ring on
 * elements marked `data-cursor="ring"`. Only mounts on devices with
 * `(hover: hover) and (pointer: fine)` — touch users get nothing,
 * never fake-cursor on touch (per brief §5.5).
 *
 * Frozen-motion mode: unmount entirely.
 */

export function DriftCursor() {
  const motionEnabled = useMotionEnabled();
  const pointerRef = usePointerRef();
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [hot, setHot] = useState(false);

  // Detect hover-capable, fine-pointer devices on mount.
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setEnabled(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setEnabled(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Track which element is hovered → toggle hot state.
  useEffect(() => {
    if (!enabled) return;
    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const cursorMode = t?.closest?.("[data-cursor]")?.getAttribute("data-cursor");
      setHot(cursorMode === "ring");
    };
    document.addEventListener("mouseover", onOver);
    return () => document.removeEventListener("mouseover", onOver);
  }, [enabled]);

  // rAF loop: lerp position toward pointer.
  useEffect(() => {
    if (!enabled || !motionEnabled) return;
    let raf = 0;
    let x = -1;
    let y = -1;

    const tick = () => {
      const p = pointerRef.current;
      if (p.present) {
        x = x === -1 ? p.x : lerp(x, p.x, 0.15);
        y = y === -1 ? p.y : lerp(y, p.y, 0.15);
        if (dotRef.current) {
          dotRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          dotRef.current.style.opacity = "1";
        }
        if (ringRef.current) {
          // Ring trails slightly behind for a subtle elasticity
          ringRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${hot ? 1 : 0})`;
          ringRef.current.style.opacity = "1";
        }
      } else {
        if (dotRef.current) dotRef.current.style.opacity = "0";
        if (ringRef.current) ringRef.current.style.opacity = "0";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, motionEnabled, hot, pointerRef]);

  if (!enabled || !motionEnabled) return null;

  return (
    <>
      <div
        ref={dotRef}
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 8,
          height: 8,
          marginLeft: -4,
          marginTop: -4,
          background: "var(--ink)",
          borderRadius: "50%",
          pointerEvents: "none",
          opacity: 0,
          zIndex: 9999,
          willChange: "transform",
          mixBlendMode: "difference",
        }}
      />
      <div
        ref={ringRef}
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 24,
          height: 24,
          marginLeft: -12,
          marginTop: -12,
          border: "1px solid var(--ink)",
          borderRadius: "50%",
          pointerEvents: "none",
          opacity: 0,
          zIndex: 9998,
          willChange: "transform",
          transition: "transform 240ms cubic-bezier(0.16, 1, 0.3, 1)",
          mixBlendMode: "difference",
        }}
      />
    </>
  );
}
