"use client";

import { useEffect, useRef } from "react";

/**
 * Single, page-wide pointer subscription. Returns a ref to the latest
 * pointer position (and a coarse `present` flag). The ref is updated on
 * pointermove without triggering re-renders.
 *
 * Consumers (Cursor, shader sections) read the ref inside their own
 * rAF loops. We do not subscribe to pointer events twice.
 *
 * On touch / coarse devices, `present` stays false and (x, y) remain at
 * (-1, -1). Components should branch on `present` to avoid faking a
 * cursor on touch.
 */

export type PointerSnapshot = {
  x: number;
  y: number;
  present: boolean;
  hasMovedAt: number; // performance.now() of last movement, 0 if never
};

const initial: PointerSnapshot = { x: -1, y: -1, present: false, hasMovedAt: 0 };

export function usePointerRef() {
  const ref = useRef<PointerSnapshot>({ ...initial });

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine) return;

    const onMove = (e: PointerEvent) => {
      ref.current.x = e.clientX;
      ref.current.y = e.clientY;
      ref.current.present = true;
      ref.current.hasMovedAt = performance.now();
    };
    const onLeave = () => {
      ref.current.present = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return ref;
}
