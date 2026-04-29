"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Power, PowerOff, Loader2, Cpu, AlertTriangle } from "lucide-react";
import {
  forgePodConnect,
  forgePodDisconnect,
  forgePodHeartbeat,
  forgePodStatus,
  type ForgePodState,
} from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * ForgePodControl — Connect/Disconnect button + status pill.
 *
 * Three behaviours:
 *   1. On mount: fetches /forge/pod/status. If a session is already active,
 *      shows the connected pill. Otherwise shows Connect.
 *   2. While connected: polls /pod/heartbeat every 30s while the tab is
 *      visible to defer the idle-session reaper. The same call returns
 *      fresh status.
 *   3. While provisioning: polls /pod/status every 4s until the pod
 *      flips to `ready` or `failed`.
 *
 * Drops a custom event on the window when state changes so other Forge
 * components (image page, video page) can react without lifting state.
 */

const STATUS_POLL_MS = 4000;
const HEARTBEAT_MS = 30000;

function gpuShortName(id: string | null | undefined): string {
  if (!id) return "GPU";
  // RunPod ids are verbose: "NVIDIA RTX PRO 6000 Blackwell Workstation Edition".
  // Trim NVIDIA prefix and any trailing edition suffix for a tidy pill.
  return id
    .replace(/^NVIDIA /, "")
    .replace(/Blackwell Workstation Edition$/, "")
    .replace(/Workstation Edition$/, "")
    .trim();
}

function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ForgePodControl() {
  const [state, setState] = useState<ForgePodState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Elapsed-since-connect, recomputed by a 1Hz interval. Stored in state so
  // changing it triggers a re-render — Date.now() called bare in render
  // wouldn't update the displayed uptime on its own.
  const [elapsedSec, setElapsedSec] = useState(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const broadcast = (next: ForgePodState | null) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("forge:pod-state", { detail: next }));
    }
  };

  const apply = useCallback((next: ForgePodState | null) => {
    setState(next);
    broadcast(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await forgePodStatus();
      apply(next);
      return next;
    } catch (e) {
      // Silently swallow polling errors — the next tick will retry.
      return null;
    }
  }, [apply]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // While connected: heartbeat. Only when tab is visible to avoid burning
  // pod time on background tabs the user has forgotten about.
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
        const next = await forgePodHeartbeat();
        apply(next);
      } catch {
        /* ignore — next tick retries */
      }
    };
    heartbeatRef.current = setInterval(beat, HEARTBEAT_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    };
  }, [state, apply]);

  // While provisioning: faster polling so the user sees the flip to ready.
  useEffect(() => {
    const isProvisioning = state?.pod?.status === "provisioning";
    if (!isProvisioning) {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
      return;
    }
    statusPollRef.current = setInterval(refresh, STATUS_POLL_MS);
    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    };
  }, [state, refresh]);

  // 1Hz uptime tick (display only — no API calls).
  useEffect(() => {
    const startedAt = state?.session?.started_at;
    if (state?.session?.status !== "active" || !startedAt) {
      setElapsedSec(0);
      return;
    }
    const startMs = new Date(startedAt).getTime();
    const update = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [state]);

  const onConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await forgePodConnect();
      apply(next);
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } }; message?: string })
          ?.response?.data?.detail ??
        (e as { message?: string })?.message ??
        "Connect failed";
      setError(detail);
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    if (!confirm("Disconnect from the GPU? Any in-flight job will be cancelled.")) return;
    setBusy(true);
    setError(null);
    try {
      const next = await forgePodDisconnect();
      apply(next);
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } }; message?: string })
          ?.response?.data?.detail ?? "Disconnect failed";
      setError(detail);
    } finally {
      setBusy(false);
    }
  };

  // ── Render branches ────────────────────────────────────────────────────

  // Loading on first paint — keep slot stable so the header doesn't jump.
  if (state === null) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" /> GPU
      </div>
    );
  }

  const pod = state.pod;
  const session = state.session;

  // Provisioning — pod deploying or pod ready but session not yet attached
  if (pod?.status === "provisioning") {
    const elapsed = pod.uptime_seconds ?? 0;
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-700/50 bg-amber-950/40 px-2.5 py-1 text-xs text-amber-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Provisioning {gpuShortName(pod.gpu_type_id)}</span>
        <span className="tabular-nums text-amber-400/70">{formatUptime(elapsed)}</span>
      </div>
    );
  }

  if (pod?.status === "failed") {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md border border-red-800/60 bg-red-950/40 px-2.5 py-1 text-xs text-red-300">
          <AlertTriangle className="h-3 w-3" />
          Deploy failed
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onConnect}
          className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-amber-600 hover:text-amber-400 disabled:opacity-50"
        >
          Retry
        </button>
      </div>
    );
  }

  // Ready + active session
  if (pod?.status === "ready" && session?.status === "active") {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-emerald-700/50 bg-emerald-950/30 px-2.5 py-1 text-xs text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <Cpu className="h-3 w-3" />
          <span>{gpuShortName(pod.gpu_type_id)}</span>
          <span className="tabular-nums text-emerald-400/80">{formatUptime(elapsedSec)}</span>
          {state.active_session_count > 1 && (
            <span className="text-emerald-400/60">· shared with {state.active_session_count - 1}</span>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onDisconnect}
          className="flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-red-700 hover:text-red-400 disabled:opacity-50"
          title="Disconnect — pod stays alive for any other connected users; otherwise terminates after a short idle window"
        >
          <PowerOff className="h-3 w-3" />
          Disconnect
        </button>
      </div>
    );
  }

  // Default: not connected — show Connect button
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={onConnect}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-amber-700/60 bg-amber-600/10 px-3 py-1 text-xs font-medium text-amber-300 transition-colors",
          "hover:border-amber-500 hover:bg-amber-600/20 hover:text-amber-200",
          "disabled:cursor-wait disabled:opacity-60",
        )}
        title="Spin up an on-demand GPU. Billed by the second while connected."
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Power className="h-3 w-3" />
        )}
        Connect GPU
      </button>
      {error && (
        <span className="max-w-[280px] truncate text-xs text-red-400" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
