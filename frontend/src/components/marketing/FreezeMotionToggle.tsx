"use client";

import { useMotionPolicy } from "@/components/skyie/MotionPolicyProvider";

/**
 * Footer-mounted toggle (per brief §8). Persists via localStorage,
 * affects every motion source through MotionPolicyProvider.
 *
 * Always reachable by keyboard. Visible focus ring per globals.css.
 */
export function FreezeMotionToggle() {
  const { motionEnabled, ready, freeze, unfreeze } = useMotionPolicy();

  return (
    <button
      type="button"
      aria-pressed={!motionEnabled}
      onClick={() => (motionEnabled ? freeze() : unfreeze())}
      className="text-mono-sm cursor-pointer text-ink/70 hover:text-ink transition-colors"
      // Hide until the provider resolves to avoid SSR/CSR mismatch flashing
      style={{ visibility: ready ? "visible" : "hidden" }}
    >
      {motionEnabled ? "freeze motion" : "resume motion"}
    </button>
  );
}
