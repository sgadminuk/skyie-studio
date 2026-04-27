"use client";

import { type ReactNode } from "react";
import { MotionPolicyProvider } from "./MotionPolicyProvider";
import { DriftCursor } from "../brand/DriftCursor";

/**
 * Client provider tree. Mounts at the root layout boundary so every
 * descendant can read motion policy + share the pointer subscription.
 *
 * Lenis + GSAP context are introduced in a later commit (route-segment
 * scoped); they are intentionally NOT here — they only run on `/`.
 */

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionPolicyProvider>
      {children}
      <DriftCursor />
    </MotionPolicyProvider>
  );
}
