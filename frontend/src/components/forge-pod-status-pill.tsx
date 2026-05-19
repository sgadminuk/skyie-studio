"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Power, PowerOff, Cpu, AlertTriangle } from "lucide-react";
import {
  forgePodDisconnect,
  forgePodHeartbeat,
  forgePodStatus,
  type ForgePodState,
} from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * ForgePodStatusPill — compact GPU status indicator for the header.
 *
 * Does NOT include a Connect button (Connect lives in the home-page hero
 * panel by design — the header is for at-a-glance status). When idle,
 * the pill is a link back to the hero so the user knows where to act.
 *
 * Stays in sync with the hero panel via the `forge:pod-state` CustomEvent
 * broadcast by ForgeConnectPanel.
 */

const HEARTBEAT_MS = 30000;

function gpuShort(id: string | null | undefined): string {
  if (!id) return "GPU";
  return id
    .replace(/^NVIDIA /, "")
    .replace(/Blackwell (Server|Workstation) Edition$/, "")
    .replace(/Workstation Edition$/, "")
    .trim();
}

function formatUptime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ForgePodStatusPill() {
  const [state, setState] = useState<ForgePodState | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await forgePodStatus());
    } catch {
      /* ignore */
    }
  }, []);

  // Initial fetch + listen for events from the hero panel
  useEffect(() => {
    refresh();
    const onState = (e: Event) => {
      setState((e as CustomEvent<ForgePodState>).detail);
    };
    window.addEventListener("forge:pod-state", onState);
    return () => window.removeEventListener("forge:pod-state", onState);
  }, [refresh]);

  // Heartbeat — only when this is the only mounted controller and tab is visible
  useEffect(() => {
    const isActive =
      state?.session?.status === "active" && state?.pod?.status === "ready";
    if (!isActive) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }
    const beat = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        setState(await forgePodHeartbeat());
      } catch {
        /* next tick retries */
      }
    };
    heartbeatRef.current = setInterval(beat, HEARTBEAT_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    };
  }, [state]);

  // 1Hz uptime tick
  useEffect(() => {
    const anchor =
      state?.session?.status === "active"
        ? state.session.started_at
        : state?.pod?.created_at;
    if (!anchor) {
      setElapsedSec(0);
      return;
    }
    const startMs = new Date(anchor).getTime();
    const update = () =>
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [state]);

  const onDisconnect = async () => {
    if (
      !confirm(
        "Disconnect from the GPU? Any in-flight generation will be cancelled.",
      )
    )
      return;
    setBusy(true);
    try {
      const next = await forgePodDisconnect();
      setState(next);
      window.dispatchEvent(new CustomEvent("forge:pod-state", { detail: next }));
    } catch {
      /* ignore — user can retry */
    } finally {
      setBusy(false);
    }
  };

  if (state === null) {
    // Initial loading — hold the slot so the header doesn't shift
    return (
      <div className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" /> GPU
      </div>
    );
  }

  const pod = state.pod;
  const session = state.session;

  if (pod?.status === "provisioning") {
    return (
      <Link
        href="/"
        className="flex items-center gap-1.5 rounded-md border border-amber-700/50 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-300 transition-colors hover:bg-amber-950/50"
        title="Connecting — open home to watch progress"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Connecting…
      </Link>
    );
  }

  if (pod?.status === "failed") {
    return (
      <Link
        href="/"
        className="flex items-center gap-1.5 rounded-md border border-red-800/60 bg-red-950/30 px-2 py-1 text-[11px] text-red-300 transition-colors hover:bg-red-950/50"
        title="Connect failed — open home to retry"
      >
        <AlertTriangle className="h-3 w-3" />
        GPU error
      </Link>
    );
  }

  if (pod?.status === "ready" && session?.status === "active") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 rounded-md border border-emerald-800/50 bg-emerald-950/25 px-2 py-1 text-[11px] text-emerald-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <Cpu className="h-3 w-3" />
          <span className="hidden sm:inline">{gpuShort(pod.gpu_type_id)}</span>
          <span className="tabular-nums text-emerald-400/80">
            {formatUptime(elapsedSec)}
          </span>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={busy}
          className={cn(
            "flex h-[26px] w-[26px] items-center justify-center rounded-md border border-zinc-700 text-zinc-400 transition-colors",
            "hover:border-red-700 hover:bg-red-950/30 hover:text-red-300",
            "disabled:opacity-50",
          )}
          title="Disconnect GPU"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <PowerOff className="h-3 w-3" />
          )}
        </button>
      </div>
    );
  }

  // Default: offline — pill links to hero
  return (
    <Link
      href="/"
      className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-amber-700/50 hover:text-amber-300"
      title="Open home page to connect a GPU"
    >
      <Power className="h-3 w-3" />
      GPU offline
    </Link>
  );
}
