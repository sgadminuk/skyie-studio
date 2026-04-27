"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * MotionPolicyProvider · the freeze-motion contract (brief §6.5, §8).
 *
 * Resolution order, highest precedence first:
 *   1. localStorage["skyie:freeze-motion"] === "1"  — footer toggle
 *   2. URL param ?reduce-motion=1                   — screenshots / CI
 *   3. window.matchMedia("(prefers-reduced-motion: reduce)")
 *
 * `motionEnabled === false` means: ambient loops freeze, entrances become
 * 150ms fades, the cursor unmounts, the §3 video becomes <video controls>,
 * shaders paint a static frame.
 */

const STORAGE_KEY = "skyie:freeze-motion";

type MotionPolicy = {
  /** True when motion should run. False ⇒ degrade per §6.5. */
  motionEnabled: boolean;
  /** Why motion is disabled, when it is (for debugging / a11y messaging). */
  reason: "user-toggle" | "url-param" | "system" | null;
  /** True once the policy has been resolved on the client. SSR ⇒ false. */
  ready: boolean;
  /** Disable motion explicitly. Persists via localStorage. */
  freeze: () => void;
  /** Re-enable motion explicitly. Clears localStorage override. */
  unfreeze: () => void;
};

const defaultPolicy: MotionPolicy = {
  motionEnabled: true,
  reason: null,
  ready: false,
  freeze: () => {},
  unfreeze: () => {},
};

const Ctx = createContext<MotionPolicy>(defaultPolicy);

export function MotionPolicyProvider({ children }: { children: ReactNode }) {
  const [userToggle, setUserToggle] = useState<"freeze" | "play" | null>(null);
  const [systemReduce, setSystemReduce] = useState(false);
  const [urlReduce, setUrlReduce] = useState(false);
  const [ready, setReady] = useState(false);

  // 1. read localStorage on mount
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "1") setUserToggle("freeze");
      else if (v === "0") setUserToggle("play");
    } catch {
      // localStorage may be unavailable (private mode etc.) — silently default
    }
    // 2. URL param
    try {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("reduce-motion");
      setUrlReduce(v === "1" || v === "true");
    } catch {
      /* noop */
    }
    setReady(true);
  }, []);

  // 3. system pref · live-update if the OS toggles
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setSystemReduce(e.matches);
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const freeze = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* noop */
    }
    setUserToggle("freeze");
  }, []);

  const unfreeze = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "0");
    } catch {
      /* noop */
    }
    setUserToggle("play");
  }, []);

  const value: MotionPolicy = useMemo(() => {
    let motionEnabled = true;
    let reason: MotionPolicy["reason"] = null;

    if (userToggle === "freeze") {
      motionEnabled = false;
      reason = "user-toggle";
    } else if (userToggle === "play") {
      // explicit override — ignore url + system
      motionEnabled = true;
    } else if (urlReduce) {
      motionEnabled = false;
      reason = "url-param";
    } else if (systemReduce) {
      motionEnabled = false;
      reason = "system";
    }

    return { motionEnabled, reason, ready, freeze, unfreeze };
  }, [userToggle, urlReduce, systemReduce, ready, freeze, unfreeze]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read the current motion policy. Outside the provider, motion is enabled. */
export function useMotionPolicy(): MotionPolicy {
  return useContext(Ctx);
}

/** Convenience: just the boolean. Defaults to `true` outside the provider. */
export function useMotionEnabled(): boolean {
  return useContext(Ctx).motionEnabled;
}
