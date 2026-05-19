"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Power,
  PowerOff,
  Loader2,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Terminal,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  Sparkles,
  Server,
  HardDrive,
  Package,
  Download,
  Brain,
  Plug,
} from "lucide-react";
import {
  forgePodConnect,
  forgePodDisconnect,
  forgePodHeartbeat,
  forgePodStatus,
  type ForgePodState,
} from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * ForgeConnectPanel — the hero-sized Connect/Disconnect experience.
 *
 * Three visual modes, swapped by pod state:
 *   1. Idle — big CTA inviting the user to spin up a GPU. Plain-language
 *      explainer + cost callout so non-technical users aren't surprised.
 *   2. Provisioning — phased checklist (Allocate → Workspace → Model → Ready)
 *      driven by elapsed time + status. Each phase shows its own spinner.
 *      "Show technical log" toggle reveals a terminal-style stream of
 *      synthesized events for power users.
 *   3. Ready — green status card with GPU, uptime, cost-so-far + Disconnect.
 *
 * Broadcasts state changes via the `forge:pod-state` CustomEvent so the
 * rest of the Forge UI (image page, video page) can react without lifting
 * state.
 */

const STATUS_POLL_MS = 4000;
const HEARTBEAT_MS = 30000;

type PhaseId = "allocate" | "workspace" | "model" | "register";

interface Phase {
  id: PhaseId;
  label: string;
  hint: string;
  icon: typeof Server;
  /** When this phase starts (sec since Connect). Cumulative. */
  startSec: number;
  /** Expected duration in sec. Used for both progress ETA + log timing. */
  durationSec: number;
}

// Times tuned for the WARM case (volume cache present): ~60-120s total.
// Cold case (first-ever boot) will overshoot — we cap the last phase at
// the actual register time so users don't see a stuck progress bar.
const PHASES: Phase[] = [
  {
    id: "allocate",
    label: "Allocating a GPU",
    hint: "Reserving an NVIDIA card in the EU-Iceland datacenter.",
    icon: Server,
    startSec: 0,
    durationSec: 25,
  },
  {
    id: "workspace",
    label: "Preparing your workspace",
    hint: "Mounting your model cache and booting the container.",
    icon: HardDrive,
    startSec: 25,
    durationSec: 45,
  },
  {
    id: "model",
    label: "Loading the AI model",
    hint: "Pulling FLUX into VRAM. ~30s warm, up to 10 min on first ever boot.",
    icon: Brain,
    startSec: 70,
    durationSec: 40,
  },
  {
    id: "register",
    label: "Final checks",
    hint: "Handshake with Forge — almost there.",
    icon: Plug,
    startSec: 110,
    durationSec: 10,
  },
];

interface LogLine {
  t: number;
  level: "info" | "warn" | "ok";
  msg: string;
}

// Log lines that get appended as phases transition. Keeps the
// "Show technical log" view feeling alive without needing real stdout.
const PHASE_LOGS: Record<PhaseId, string[]> = {
  allocate: [
    "[runpod] POST /v1/pods — deploying on-demand pod",
    "[runpod] gpu request: NVIDIA RTX class, EUR-IS-1",
    "[runpod] container disk: 50 GB, network volume: 7muboz2qp0",
    "[runpod] pod accepted by scheduler, waiting for assignment...",
    "[runpod] pod assigned, publicIp pending",
  ],
  workspace: [
    "[pod] container starting (runpod/pytorch:2.4.0-cuda12.4)",
    "[pod] sshd up on :22, waiting for app start",
    "[volume] mounting /runpod-volume (MooseFS)",
    "[venv] /runpod-volume/forge-app/venv/.install-complete found — reusing",
    "[serve] uvicorn 0.32.0 starting on :8888",
  ],
  model: [
    "[handler] _get_pipe() called — loading FLUX.1-dev",
    "[diffusers] reading config from cache_dir=/runpod-volume/models/.hf_cache",
    "[diffusers] loading transformer (bfloat16) ...",
    "[diffusers] loading text encoder + VAE ...",
    "[torch] pipe.to(cuda) — moving weights to VRAM",
    "[handler] FLUX warm in VRAM, vram_used=~17 GB",
  ],
  register: [
    "[serve] POST /api/internal/gpu-register",
    "[backend] pod marked ready, registered_url stored in Redis",
    "[serve] heartbeat task scheduled (60s)",
    "[ok] connected — generate calls will route to this pod",
  ],
};

function gpuShortName(id: string | null | undefined): string {
  if (!id) return "GPU";
  return id
    .replace(/^NVIDIA /, "")
    .replace(/Blackwell (Server|Workstation) Edition$/, "")
    .replace(/Workstation Edition$/, "")
    .trim();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function currentPhaseId(elapsedSec: number, registered: boolean): PhaseId {
  if (registered) return "register";
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (elapsedSec >= PHASES[i].startSec) return PHASES[i].id;
  }
  return "allocate";
}

function phaseStatus(
  phase: Phase,
  current: PhaseId,
  registered: boolean,
): "done" | "active" | "pending" {
  const currentIdx = PHASES.findIndex((p) => p.id === current);
  const phaseIdx = PHASES.findIndex((p) => p.id === phase.id);
  if (registered) return "done";
  if (phaseIdx < currentIdx) return "done";
  if (phaseIdx === currentIdx) return "active";
  return "pending";
}

export function ForgeConnectPanel() {
  const [state, setState] = useState<ForgePodState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [showRawLog, setShowRawLog] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const lastPhaseRef = useRef<PhaseId | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logTailRef = useRef<HTMLDivElement | null>(null);

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
    } catch {
      return null;
    }
  }, [apply]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Heartbeat while connected
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
        /* next tick retries */
      }
    };
    heartbeatRef.current = setInterval(beat, HEARTBEAT_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    };
  }, [state, apply]);

  // Faster polling while provisioning
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

  // 1Hz elapsed-time tick. Driven from pod.created_at while provisioning,
  // session.started_at while active.
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

  // Reset log buffer when leaving provisioning
  useEffect(() => {
    if (state?.pod?.status !== "provisioning" && state?.pod?.status !== "ready") {
      setLogs([]);
      lastPhaseRef.current = null;
    }
  }, [state?.pod?.status]);

  // Append synthesized log lines as phases advance
  useEffect(() => {
    if (state?.pod?.status !== "provisioning" && state?.pod?.status !== "ready") return;
    const registered = !!state?.pod?.registered_url;
    const current = currentPhaseId(elapsedSec, registered);
    if (lastPhaseRef.current === current) return;

    const lines = PHASE_LOGS[current] || [];
    setLogs((prev) => [
      ...prev,
      ...lines.map((msg, i) => ({
        t: elapsedSec + i * 0.05,
        level: "info" as const,
        msg,
      })),
    ]);
    lastPhaseRef.current = current;
  }, [elapsedSec, state]);

  // Auto-scroll the raw log
  useEffect(() => {
    if (showRawLog && logTailRef.current) {
      logTailRef.current.scrollTop = logTailRef.current.scrollHeight;
    }
  }, [logs, showRawLog]);

  const onConnect = async () => {
    setBusy(true);
    setError(null);
    setLogs([
      {
        t: 0,
        level: "info",
        msg: "[client] POST /api/v1/forge/pod/connect",
      },
    ]);
    lastPhaseRef.current = null;
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
    if (
      !confirm(
        "Disconnect from the GPU? Any in-flight generation will be cancelled.",
      )
    )
      return;
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

  const pod = state?.pod;
  const session = state?.session;
  const isProvisioning = pod?.status === "provisioning";
  const isFailed = pod?.status === "failed";
  const isReady = pod?.status === "ready" && session?.status === "active";

  const currentPhase = useMemo(() => {
    if (!isProvisioning && !isReady) return null;
    return currentPhaseId(elapsedSec, !!pod?.registered_url);
  }, [elapsedSec, pod?.registered_url, isProvisioning, isReady]);

  const estCostUsd = useMemo(() => {
    const rate = pod?.cost_per_hr ?? 1.89;
    return ((elapsedSec / 3600) * rate).toFixed(3);
  }, [elapsedSec, pod?.cost_per_hr]);

  // Initial loading state — keep the slot stable so the hero doesn't jump
  if (state === null) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-500" />
        <p className="mt-3 text-sm text-zinc-500">Checking your GPU status…</p>
      </div>
    );
  }

  // ── Failed ─────────────────────────────────────────────────────────────
  if (isFailed) {
    return (
      <div className="rounded-2xl border border-red-900/60 bg-gradient-to-br from-red-950/40 to-zinc-900/40 p-8">
        <div className="flex items-start gap-4">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-400" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-300">
              GPU deployment failed
            </h3>
            <p className="mt-1 text-sm text-red-200/80">
              {pod?.error ||
                "We couldn't allocate a GPU. This usually clears up in a minute."}
            </p>
            <button
              type="button"
              onClick={onConnect}
              disabled={busy}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Provisioning ───────────────────────────────────────────────────────
  if (isProvisioning) {
    const registered = !!pod?.registered_url;
    return (
      <div className="overflow-hidden rounded-2xl border border-amber-900/40 bg-gradient-to-br from-amber-950/30 via-zinc-900/40 to-zinc-900/40">
        <div className="border-b border-amber-900/30 bg-amber-950/20 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15">
                <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-amber-200">
                  Spinning up your GPU
                </div>
                <div className="text-xs text-amber-300/70">
                  Hang tight — usually 1–2 minutes when your workspace is warm.
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums text-amber-100">
                {formatDuration(elapsedSec)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-amber-300/70">
                Elapsed
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <ul className="space-y-3">
            {PHASES.map((p) => {
              const status = phaseStatus(p, currentPhase ?? "allocate", registered);
              const Icon = p.icon;
              return (
                <li key={p.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                    {status === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : status === "active" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                    ) : (
                      <Circle className="h-5 w-5 text-zinc-700" />
                    )}
                  </span>
                  <div className="flex-1">
                    <div
                      className={cn(
                        "flex items-center gap-2 text-sm font-medium",
                        status === "done"
                          ? "text-emerald-200/80"
                          : status === "active"
                            ? "text-amber-100"
                            : "text-zinc-500",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {p.label}
                    </div>
                    {status === "active" && (
                      <p className="mt-0.5 text-xs text-amber-300/70">{p.hint}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Raw log toggle */}
          <button
            type="button"
            onClick={() => setShowRawLog((v) => !v)}
            className="mt-5 flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <Terminal className="h-3 w-3" />
            {showRawLog ? "Hide" : "Show"} technical log
            {showRawLog ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          {showRawLog && (
            <div
              ref={logTailRef}
              className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-zinc-400"
            >
              {logs.length === 0 ? (
                <div className="text-zinc-600">Waiting for first event…</div>
              ) : (
                logs.map((line, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0 text-zinc-600 tabular-nums">
                      +{line.t.toFixed(1).padStart(5, "0")}s
                    </span>
                    <span
                      className={cn(
                        line.level === "warn" && "text-amber-300",
                        line.level === "ok" && "text-emerald-300",
                      )}
                    >
                      {line.msg}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Ready ──────────────────────────────────────────────────────────────
  if (isReady) {
    return (
      <div className="overflow-hidden rounded-2xl border border-emerald-900/50 bg-gradient-to-br from-emerald-950/20 via-zinc-900/40 to-zinc-900/40">
        <div className="border-b border-emerald-900/30 bg-emerald-950/15 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-emerald-400 opacity-60" />
                <Cpu className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                  Connected · {gpuShortName(pod?.gpu_type_id)}
                  {state.active_session_count > 1 && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                      shared
                    </span>
                  )}
                </div>
                <div className="text-xs text-emerald-300/70">
                  Ready to generate. Disconnect when you&apos;re done so the
                  billing stops.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-red-700 hover:bg-red-950/30 hover:text-red-300 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <PowerOff className="h-3 w-3" />
              )}
              Disconnect
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-zinc-800 px-6 py-4">
          <div>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
              <Clock className="h-3 w-3" /> Uptime
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
              {formatDuration(elapsedSec)}
            </div>
          </div>
          <div className="pl-4">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
              <Zap className="h-3 w-3" /> Rate
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
              ${(pod?.cost_per_hr ?? 0).toFixed(2)}
              <span className="ml-0.5 text-xs font-normal text-zinc-500">/hr</span>
            </div>
          </div>
          <div className="pl-4">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
              <Sparkles className="h-3 w-3" /> Cost so far
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
              ${estCostUsd}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Idle (default) ─────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-2xl border border-amber-900/30 bg-gradient-to-br from-amber-950/20 via-zinc-900/40 to-rose-950/10">
      <div className="grid gap-6 px-8 py-8 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-amber-400">
            <Zap className="h-3 w-3" />
            On-demand GPU
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
            Spin up your private GPU
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-zinc-400">
            Click once and we&apos;ll wake a dedicated NVIDIA GPU in Iceland.
            You get FLUX, character LoRAs and your full Forge toolkit ready in
            about a minute. Billed by the second — never while idle.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-amber-400/60" /> ~$1.89 / hour
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-amber-400/60" /> 1–2 min warm boot
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-amber-400/60" /> Auto-shuts off when you disconnect
            </span>
          </div>
          {error && (
            <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onConnect}
          disabled={busy}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl bg-amber-500 px-7 py-4 text-base font-semibold text-zinc-950 shadow-lg shadow-amber-500/20 transition-all",
            "hover:bg-amber-400 hover:shadow-amber-500/30 hover:scale-[1.02]",
            "disabled:cursor-wait disabled:opacity-60 disabled:hover:scale-100",
          )}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Power className="h-5 w-5" />
          )}
          {busy ? "Connecting…" : "Connect GPU"}
          {!busy && (
            <span className="rounded-md bg-zinc-950/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              ⌘ K
            </span>
          )}
        </button>
      </div>

      <div className="border-t border-zinc-800/60 bg-zinc-950/40 px-8 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <Package className="h-3 w-3" />
            FLUX.1-dev
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Download className="h-3 w-3" />
            PuLID identity
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            LoRA stacking
          </span>
          <span className="ml-auto text-zinc-600">All loaded the moment you connect.</span>
        </div>
      </div>
    </div>
  );
}
