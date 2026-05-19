"use client";

import Link from "next/link";
import {
  Film,
  Sparkles,
  Upload,
  Wand2,
  Mic,
  Bell,
  Lock,
  PlayCircle,
  ArrowLeft,
  Clock,
  Maximize2,
  Volume2,
} from "lucide-react";

/**
 * Forge Video — placeholder for the eventual Wan 2.2 / InfiniteTalk video
 * suite. The page is a mocked-up UI marked "Coming soon" so users can
 * preview what they'll be able to do without anything actually working.
 */

const CAPABILITIES = [
  {
    icon: Wand2,
    title: "Text-to-video",
    body: "Describe a scene in plain language. Get up to 8 seconds of 1080p video back.",
  },
  {
    icon: Upload,
    title: "Image-to-video",
    body: "Drop one of your Forge stills. We animate it — camera moves, parallax, the whole vibe.",
  },
  {
    icon: Mic,
    title: "Talking-head sync",
    body: "Reference portrait + audio clip = lip-synced talking video. InfiniteTalk under the hood.",
  },
];

export default function ForgeVideoPage() {
  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          <ArrowLeft className="h-3 w-3" /> Back to home
        </Link>
      </div>

      {/* Hero */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-rose-300">
          <Lock className="h-3 w-3" />
          Coming soon · Wan 2.2 14B
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          Long-form video,
          <br />
          <span className="bg-gradient-to-r from-rose-400 to-amber-500 bg-clip-text text-transparent">
            on your hardware.
          </span>
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-zinc-400">
          Forge video is where Veo and Runway end. Open-weights Wan 2.2,
          stacked with your character LoRAs, running on the same on-demand
          GPU you already connect for image work. No watermark. No
          provider filter.
        </p>
      </header>

      {/* Mocked editor preview */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
        {/* The "coming soon" wash — kept light so the mock is still visible */}
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[1px]">
          <div className="rounded-xl border border-rose-500/30 bg-zinc-950/85 px-6 py-4 text-center">
            <Lock className="mx-auto h-5 w-5 text-rose-400" />
            <div className="mt-2 text-sm font-semibold text-rose-200">
              In development
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              This is a preview of what the surface will look like.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_320px]">
          {/* Preview canvas mock */}
          <div className="flex aspect-video items-center justify-center border-b border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 lg:border-b-0 lg:border-r">
            <div className="text-center">
              <PlayCircle className="mx-auto h-12 w-12 text-zinc-700" />
              <p className="mt-2 text-xs text-zinc-600">Video preview</p>
            </div>
          </div>

          {/* Controls panel mock */}
          <div className="space-y-4 p-5">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Prompt
              </label>
              <div className="mt-1 h-20 rounded-md border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-600">
                A woman walking through a neon-lit Tokyo street at night,
                cinematic, anamorphic lens flare…
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Reference image (optional)
              </label>
              <div className="mt-1 flex items-center justify-center rounded-md border border-dashed border-zinc-800 bg-zinc-950 py-4 text-xs text-zinc-600">
                <Upload className="mr-1.5 h-3 w-3" />
                Drop an image
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                  <Clock className="h-2.5 w-2.5" />
                  Duration
                </div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-300">
                  6 s
                </div>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                  <Maximize2 className="h-2.5 w-2.5" />
                  Resolution
                </div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-300">
                  1080p
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-500">
              <Volume2 className="h-3 w-3" />
              Generate audio (Veo-style)
              <span className="ml-auto rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-500">
                ON
              </span>
            </div>

            <button
              type="button"
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-md bg-rose-500/30 px-4 py-2 text-sm font-semibold text-rose-200/60"
            >
              <Sparkles className="h-4 w-4" />
              Generate video
            </button>
          </div>
        </div>
      </div>

      {/* Capabilities */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-zinc-300">
          <Film className="h-4 w-4 text-rose-400" />
          <h2 className="text-base font-semibold">What you&apos;ll be able to make</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {CAPABILITIES.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
              >
                <Icon className="h-5 w-5 text-rose-400" />
                <h3 className="mt-3 text-sm font-semibold text-zinc-100">
                  {c.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {c.body}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Notify CTA */}
      <section className="rounded-xl border border-amber-900/30 bg-gradient-to-br from-amber-950/20 to-zinc-900/40 p-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              Want to test this when it ships?
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              Email us at{" "}
              <a
                href="mailto:hello@skyieglobal.co.uk?subject=Forge%20Video%20Early%20Access"
                className="font-mono text-amber-400 hover:underline"
              >
                hello@skyieglobal.co.uk
              </a>{" "}
              and we&apos;ll add you to the early-access list.
            </p>
          </div>
          <a
            href="mailto:hello@skyieglobal.co.uk?subject=Forge%20Video%20Early%20Access"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-700/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/15"
          >
            <Bell className="h-4 w-4" />
            Notify me
          </a>
        </div>
      </section>
    </div>
  );
}
