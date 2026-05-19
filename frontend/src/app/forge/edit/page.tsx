"use client";

import Link from "next/link";
import {
  Scissors,
  Bell,
  Lock,
  ArrowLeft,
  Type,
  Palette,
  Music,
  Wand2,
  Maximize2,
  Crop,
  Subtitles,
  Volume2,
  Plus,
  Play,
} from "lucide-react";

/**
 * Forge Edit — placeholder for the in-house video edit suite. Mocked
 * timeline + tools panel so users can preview what the eventual surface
 * will feel like.
 */

const TOOLS = [
  {
    icon: Subtitles,
    title: "Auto-captions",
    body: "Transcribe and burn-in captions in any language. Styled to match your brand.",
  },
  {
    icon: Music,
    title: "Music beds",
    body: "Royalty-free score library, beat-matched to your cuts. Or upload your own.",
  },
  {
    icon: Crop,
    title: "Aspect reframes",
    body: "One source clip → 16:9, 9:16, 1:1. Smart auto-pan keeps subjects in frame.",
  },
  {
    icon: Palette,
    title: "Color grading",
    body: "Cinematic LUTs, scene-matched color, exposure pulls. No timeline gymnastics.",
  },
];

// Mock timeline blocks — purely visual
const VIDEO_CLIPS = [
  { w: "20%", color: "bg-rose-500/40" },
  { w: "30%", color: "bg-rose-500/30" },
  { w: "25%", color: "bg-rose-500/40" },
  { w: "15%", color: "bg-rose-500/30" },
];

const AUDIO_CLIPS = [
  { w: "45%", color: "bg-emerald-500/30" },
  { w: "30%", color: "bg-emerald-500/20" },
];

export default function ForgeEditPage() {
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
          Coming soon · Edit suite
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          From generation to finished film.
          <br />
          <span className="bg-gradient-to-r from-rose-400 to-amber-500 bg-clip-text text-transparent">
            Without ever leaving Forge.
          </span>
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-zinc-400">
          Cut, color, caption, score and reframe — a proper editing studio
          built around the clips you generate here. No round-trip through
          Premiere. No watermarks. No timeline export hell.
        </p>
      </header>

      {/* Mock editor */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[1px]">
          <div className="rounded-xl border border-rose-500/30 bg-zinc-950/85 px-6 py-4 text-center">
            <Lock className="mx-auto h-5 w-5 text-rose-400" />
            <div className="mt-2 text-sm font-semibold text-rose-200">
              In development
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Preview of the eventual edit surface.
            </p>
          </div>
        </div>

        {/* Top: preview + tools */}
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_240px]">
          <div className="flex aspect-video items-center justify-center border-b border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3 text-zinc-700">
              <Play className="h-12 w-12" />
            </div>
          </div>
          <div className="space-y-2 p-3">
            {[
              { icon: Wand2, label: "Smart trim" },
              { icon: Type, label: "Title card" },
              { icon: Subtitles, label: "Captions" },
              { icon: Music, label: "Music bed" },
              { icon: Palette, label: "Color grade" },
              { icon: Volume2, label: "Audio mix" },
              { icon: Maximize2, label: "Reframe" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-400"
              >
                <Icon className="h-3.5 w-3.5 text-rose-400/80" />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Timeline mock */}
        <div className="border-t border-zinc-800 bg-zinc-950/50 p-4">
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
            <span>Timeline</span>
            <span className="font-mono text-zinc-600">00:00 — 00:30</span>
          </div>

          <div className="space-y-1.5">
            {/* Video track */}
            <div className="flex items-center gap-2">
              <div className="w-12 shrink-0 text-[10px] text-zinc-500">VIDEO</div>
              <div className="relative h-8 flex-1 overflow-hidden rounded bg-zinc-900">
                <div className="flex h-full">
                  {VIDEO_CLIPS.map((c, i) => (
                    <div
                      key={i}
                      className={`${c.color} border-r border-zinc-950`}
                      style={{ width: c.w }}
                    />
                  ))}
                </div>
              </div>
            </div>
            {/* Caption track */}
            <div className="flex items-center gap-2">
              <div className="w-12 shrink-0 text-[10px] text-zinc-500">TEXT</div>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-zinc-900">
                <div
                  className="h-full bg-amber-500/30"
                  style={{ marginLeft: "10%", width: "65%" }}
                />
              </div>
            </div>
            {/* Audio track */}
            <div className="flex items-center gap-2">
              <div className="w-12 shrink-0 text-[10px] text-zinc-500">AUDIO</div>
              <div className="relative h-6 flex-1 overflow-hidden rounded bg-zinc-900">
                <div className="flex h-full">
                  {AUDIO_CLIPS.map((c, i) => (
                    <div
                      key={i}
                      className={`${c.color} border-r border-zinc-950`}
                      style={{ width: c.w }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500"
          >
            <Plus className="h-3 w-3" /> Add clip
          </button>
        </div>
      </div>

      {/* Tools detail */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-zinc-300">
          <Scissors className="h-4 w-4 text-rose-400" />
          <h2 className="text-base font-semibold">What the suite will do</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
              >
                <Icon className="h-5 w-5 text-rose-400" />
                <h3 className="mt-3 text-sm font-semibold text-zinc-100">
                  {t.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {t.body}
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
              Beta-test the edit suite?
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              Email{" "}
              <a
                href="mailto:hello@skyieglobal.co.uk?subject=Forge%20Edit%20Suite%20Early%20Access"
                className="font-mono text-amber-400 hover:underline"
              >
                hello@skyieglobal.co.uk
              </a>{" "}
              and we&apos;ll add you to the early-access list.
            </p>
          </div>
          <a
            href="mailto:hello@skyieglobal.co.uk?subject=Forge%20Edit%20Suite%20Early%20Access"
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
