"use client";

import Link from "next/link";
import {
  ImagePlus,
  Users,
  Film,
  Mic,
  Scissors,
  Layers,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ForgeFeatureGrid — the "what you can do here" gallery on the home page.
 *
 * Each tile maps to one of the open-weights workflows Forge is building.
 * `status: "live"` tiles link into the working surface. Everything else
 * shows a "Coming soon" badge and is disabled — the tile is still rendered
 * so users can see the roadmap and pick the right tool for their need.
 */

type FeatureStatus = "live" | "beta" | "soon";

interface Feature {
  id: string;
  href: string;
  status: FeatureStatus;
  icon: typeof ImagePlus;
  title: string;
  pitch: string;
  bullets: string[];
  model: string;
  accent: string;
}

const FEATURES: Feature[] = [
  {
    id: "image",
    href: "/image",
    status: "live",
    icon: ImagePlus,
    title: "Image generation",
    pitch:
      "Photoreal portraits, fashion shoots, editorial covers. Whatever you can describe.",
    bullets: [
      "Text-to-image up to 2048×2048",
      "5 aspect-ratio presets — portrait, landscape, square",
      "~3 seconds per image once your GPU is warm",
    ],
    model: "FLUX.1-dev",
    accent: "amber",
  },
  {
    id: "identity",
    href: "/image",
    status: "beta",
    icon: Sparkles,
    title: "Identity-locked portraits",
    pitch:
      "Upload one reference photo. Generate a hundred shots with the same face.",
    bullets: [
      "Drop a reference image alongside any prompt",
      "Adjustable identity weight — soft to exact",
      "Great for model portfolios, headshots, look-books",
    ],
    model: "FLUX + PuLID",
    accent: "amber",
  },
  {
    id: "characters",
    href: "/characters",
    status: "soon",
    icon: Users,
    title: "Custom characters",
    pitch:
      "Train a LoRA from 10–30 photos. Reuse the same character across every shot, every shoot.",
    bullets: [
      "~5 minutes to train on your connected GPU",
      "True cross-scene identity, not just face-swap",
      "Stack with FLUX prompts and style LoRAs",
    ],
    model: "LoRA fine-tune",
    accent: "rose",
  },
  {
    id: "video",
    href: "/video",
    status: "soon",
    icon: Film,
    title: "Video generation",
    pitch:
      "Long-form, character-driven scenes that Veo and Runway won't render.",
    bullets: [
      "Image-to-video — animate your stills",
      "Text-to-video up to 8 seconds, 1080p",
      "Combine with character LoRAs for consistency",
    ],
    model: "Wan 2.2 14B",
    accent: "rose",
  },
  {
    id: "lipsync",
    href: "/video",
    status: "soon",
    icon: Mic,
    title: "Talking-head video",
    pitch:
      "Drop in a portrait and an audio clip — get a lip-synced talking video back.",
    bullets: [
      "Audio-driven lip sync from your own voice",
      "Maintains the face, lighting, and mood you started with",
      "Up to 60 seconds per clip",
    ],
    model: "InfiniteTalk",
    accent: "rose",
  },
  {
    id: "edit",
    href: "/edit",
    status: "soon",
    icon: Scissors,
    title: "Edit suite",
    pitch:
      "Cut, colour, caption and arrange clips into a finished video — all without leaving Forge.",
    bullets: [
      "Timeline editor with multi-track support",
      "Auto-captions and music beds",
      "Aspect-ratio reframes for every platform",
    ],
    model: "In-house",
    accent: "rose",
  },
];

const ACCENT_STYLES: Record<string, { ring: string; chip: string; icon: string }> = {
  amber: {
    ring: "hover:border-amber-500/50",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    icon: "text-amber-400",
  },
  rose: {
    ring: "hover:border-rose-500/40",
    chip: "border-rose-500/25 bg-rose-500/5 text-rose-300/90",
    icon: "text-rose-300/80",
  },
};

function StatusBadge({ status }: { status: FeatureStatus }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live
      </span>
    );
  }
  if (status === "beta") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
        Beta
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
      Coming soon
    </span>
  );
}

function FeatureCard({ f }: { f: Feature }) {
  const accent = ACCENT_STYLES[f.accent] ?? ACCENT_STYLES.amber;
  const Icon = f.icon;
  const isLive = f.status === "live" || f.status === "beta";

  const inner = (
    <div
      className={cn(
        "group flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 transition-all",
        isLive ? accent.ring : "opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            isLive ? "bg-zinc-800/80" : "bg-zinc-900",
          )}
        >
          <Icon className={cn("h-5 w-5", isLive ? accent.icon : "text-zinc-600")} />
        </div>
        <StatusBadge status={f.status} />
      </div>

      <h3 className="mt-4 text-base font-semibold text-zinc-100">{f.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-zinc-400">{f.pitch}</p>

      <ul className="mt-3 space-y-1 text-xs text-zinc-500">
        {f.bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-zinc-700" />
            {b}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center justify-between pt-4">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]",
            accent.chip,
          )}
        >
          <Layers className="h-2.5 w-2.5" />
          {f.model}
        </span>
        {isLive && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 transition-colors group-hover:text-zinc-100">
            Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </div>
  );

  if (!isLive) {
    return (
      <div
        className="relative cursor-not-allowed"
        title={`${f.title} is on the roadmap — not yet shipped.`}
      >
        {inner}
      </div>
    );
  }
  return (
    <Link href={f.href} className="block">
      {inner}
    </Link>
  );
}

export function ForgeFeatureGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((f) => (
        <FeatureCard key={f.id} f={f} />
      ))}
    </div>
  );
}
