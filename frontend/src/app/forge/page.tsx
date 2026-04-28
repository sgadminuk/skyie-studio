"use client";

import { useEffect, useState } from "react";
import { Flame, ImagePlus, Film, Users, Lock, Loader2, AlertCircle } from "lucide-react";
import { getForgeStatus, type ForgeStatus } from "@/lib/api";

const ROADMAP = [
  {
    icon: ImagePlus,
    title: "Image",
    summary: "FLUX.1-dev with PuLID identity preservation. Editorial, fashion, portfolio — no provider-side filter.",
    when: "Phase 1",
  },
  {
    icon: Users,
    title: "Characters",
    summary: "Train a LoRA from 10–30 photos in ~5 min. Reuse across every shot for true cross-scene identity.",
    when: "Phase 2",
  },
  {
    icon: Film,
    title: "Video",
    summary: "Wan 2.2 14B + character LoRAs. Long-form character-driven scenes that Veo can't render.",
    when: "Phase 3",
  },
];

type GateState =
  | { kind: "loading" }
  | { kind: "ok"; status: ForgeStatus }
  | { kind: "blocked"; reason: string };

export default function ForgeHomePage() {
  const [state, setState] = useState<GateState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    getForgeStatus()
      .then((status) => {
        if (!cancelled) setState({ kind: "ok", status });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const detail =
          (err as { response?: { data?: { detail?: string }; status?: number } })?.response;
        if (detail?.status === 403) {
          setState({
            kind: "blocked",
            reason: detail.data?.detail || "Forge access not enabled for this account",
          });
        } else {
          setState({
            kind: "blocked",
            reason: "Could not reach the Forge API. Try again in a moment.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-amber-400">
          <Flame className="h-3 w-3" />
          Pre-launch · gated
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          Your own platform.
          <br />
          <span className="bg-gradient-to-r from-amber-400 to-rose-500 bg-clip-text text-transparent">
            No filter. No ceiling.
          </span>
        </h1>
        <p className="max-w-xl text-zinc-400">
          Skyie Forge is the open-weights surface — FLUX, Wan, InfiniteTalk and
          your own character LoRAs running on hardware you control. Built for
          identity-consistent, editorial-quality work where Studio&apos;s
          providers won&apos;t go.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Account
        </h2>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying Forge access…
            </div>
          )}
          {state.kind === "blocked" && (
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div>
                <div className="text-sm font-medium text-rose-400">Forge access not enabled</div>
                <p className="mt-1 text-xs text-zinc-400">{state.reason}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Forge requires a separate enrolment with age verification.
                  The flow isn&apos;t live yet — for now it&apos;s manually
                  granted to specific accounts.
                </p>
              </div>
            </div>
          )}
          {state.kind === "ok" && (
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Email</div>
                <div className="font-mono text-zinc-200">{state.status.email}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Status</div>
                <div className="flex items-center gap-1.5 text-amber-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Enrolled
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Credits</div>
                <div className="tabular-nums text-zinc-200">{state.status.credits}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          What&apos;s being built
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {ROADMAP.map(({ icon: Icon, title, summary, when }) => (
            <div
              key={title}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 transition-colors hover:border-amber-500/30"
            >
              <div className="mb-3 flex items-center justify-between">
                <Icon className="h-5 w-5 text-amber-500" />
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {when}
                </span>
              </div>
              <div className="text-sm font-semibold text-zinc-100">{title}</div>
              <p className="mt-1 text-xs text-zinc-400">{summary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <div className="text-xs text-zinc-400">
            <span className="font-medium text-zinc-200">House rules.</span>{" "}
            Forge is for content you have the right to create — your own
            likeness, consenting models, or fully synthetic subjects. No
            uploads of identifiable third parties without consent. No content
            involving minors. Outputs carry an invisible C2PA tag identifying
            them as AI-generated. Reports go to{" "}
            <span className="font-mono">hello@skyieglobal.co.uk</span>.
          </div>
        </div>
      </section>
    </div>
  );
}
