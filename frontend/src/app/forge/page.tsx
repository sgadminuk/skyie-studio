"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Flame,
  Lock,
  Loader2,
  AlertCircle,
  HelpCircle,
  Lightbulb,
  Shield,
  MessageCircleQuestion,
  PlayCircle,
} from "lucide-react";
import { getForgeStatus, type ForgeStatus } from "@/lib/api";
import { ForgeConnectPanel } from "@/components/forge-connect-panel";
import { ForgeFeatureGrid } from "@/components/forge-feature-grid";

type GateState =
  | { kind: "loading" }
  | { kind: "ok"; status: ForgeStatus }
  | { kind: "blocked"; reason: string };

const HOW_IT_WORKS: { step: string; title: string; body: string }[] = [
  {
    step: "1",
    title: "Connect a GPU",
    body: "Click the big Connect button below. We wake a private NVIDIA GPU for you in ~60 seconds.",
  },
  {
    step: "2",
    title: "Pick a workflow",
    body: "Image, identity-locked portraits, custom characters, video — choose what you want to make.",
  },
  {
    step: "3",
    title: "Generate, refine, save",
    body: "Outputs land in your library. Iterate on the prompt or seed until it's exactly right.",
  },
  {
    step: "4",
    title: "Disconnect when done",
    body: "Hit Disconnect to stop the GPU. You're only billed for the seconds you were connected.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What does FLUX.1-dev actually do?",
    a: "It's a state-of-the-art open-weights image model. Think Midjourney quality, but running on your own GPU with no provider-side filter, no rate limit, and unlimited generations while connected.",
  },
  {
    q: "Why does the first Connect take longer?",
    a: "Your private workspace boots from a fresh cache the very first time — about 10–15 minutes to download the model. Every Connect after that is 1–2 minutes because the model is already cached.",
  },
  {
    q: "How is this billed?",
    a: "By the second, only while the GPU is connected. A typical 10-minute session costs about 30 cents. The GPU auto-stops if you forget to disconnect.",
  },
  {
    q: "Can I use my own characters or styles?",
    a: "Yes — character LoRA training is coming next. Drop 10–30 photos of a person or style and we'll train a personalised model in ~5 minutes that you can use across every shot.",
  },
];

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

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verifying Forge access…
        </div>
      </div>
    );
  }

  if (state.kind === "blocked") {
    return (
      <div className="space-y-6">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-amber-400">
            <Flame className="h-3 w-3" />
            Forge · gated access
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Your account isn&apos;t enrolled yet
          </h1>
        </header>
        <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            <div>
              <div className="text-sm font-medium text-rose-300">
                Forge access not enabled
              </div>
              <p className="mt-1 text-sm text-zinc-400">{state.reason}</p>
              <p className="mt-3 text-xs text-zinc-500">
                Forge requires a separate enrolment with age verification. The
                self-serve flow isn&apos;t live yet — for now it&apos;s
                manually granted to specific accounts. Email{" "}
                <a
                  href="mailto:hello@skyieglobal.co.uk"
                  className="font-mono text-amber-400 underline-offset-2 hover:underline"
                >
                  hello@skyieglobal.co.uk
                </a>{" "}
                to request access.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-amber-400">
            <Flame className="h-3 w-3" />
            Welcome to Forge
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Make whatever you can imagine.
            <br />
            <span className="bg-gradient-to-r from-amber-400 to-rose-500 bg-clip-text text-transparent">
              On your own GPU.
            </span>
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-zinc-400">
            Forge is a private creative studio for images, characters and video.
            You drive an open-weights AI stack — FLUX, PuLID, LoRAs and Wan —
            running on hardware you spin up just for yourself.
          </p>
        </div>

        {/* The big Connect panel */}
        <ForgeConnectPanel />

        {/* Account chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2.5 py-1 text-zinc-400">
            Signed in as{" "}
            <span className="font-mono text-zinc-200">{state.status.email}</span>
          </span>
          <span className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2.5 py-1 text-zinc-400">
            Credits:{" "}
            <span className="tabular-nums text-zinc-200">{state.status.credits}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-900/40 bg-emerald-950/30 px-2.5 py-1 text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Forge enrolled
          </span>
        </div>
      </section>

      {/* ── What you can do ───────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-100">
              Pick a workflow
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              What do you want to make today? Live workflows open instantly —
              the rest are on the roadmap.
            </p>
          </div>
          <Link
            href="/image"
            className="hidden items-center gap-1 rounded-md border border-amber-700/50 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/15 sm:inline-flex"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            Jump into Image
          </Link>
        </div>
        <ForgeFeatureGrid />
      </section>

      {/* ── How it works ──────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            How it works
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((s) => (
            <div
              key={s.step}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-300">
                {s.step}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-zinc-100">
                {s.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <MessageCircleQuestion className="h-4 w-4 text-amber-400" />
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            Common questions
          </h2>
        </div>
        <div className="space-y-2">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-4 open:bg-zinc-900/50"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-zinc-200 marker:content-['']">
                <span className="flex items-center gap-2">
                  <HelpCircle className="h-3.5 w-3.5 text-zinc-500" />
                  {item.q}
                </span>
                <span className="text-xs text-zinc-500 transition-transform group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ── House rules ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-800/70 bg-zinc-900/30 p-5">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <div className="text-xs leading-relaxed text-zinc-400">
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

      {/* ── Footer pointer for users who hit issues ──────────────────── */}
      <section className="flex flex-col items-center gap-2 pb-4 text-center">
        <AlertCircle className="h-4 w-4 text-zinc-600" />
        <p className="text-xs text-zinc-500">
          Something not working? Email{" "}
          <a
            href="mailto:hello@skyieglobal.co.uk"
            className="font-mono text-amber-400 hover:underline"
          >
            hello@skyieglobal.co.uk
          </a>{" "}
          — we read every message.
        </p>
      </section>
    </div>
  );
}
