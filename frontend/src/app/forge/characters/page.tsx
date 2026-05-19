"use client";

import Link from "next/link";
import {
  Users,
  UserPlus,
  Upload,
  Bell,
  Lock,
  ArrowLeft,
  Sparkles,
  Image as ImageIcon,
  Layers,
  CheckCircle2,
} from "lucide-react";

/**
 * Forge Characters — placeholder for the LoRA training surface.
 *
 * Lets a user upload 10–30 photos of a subject and train a personalised
 * LoRA in ~5 minutes on their connected GPU. Mocked-up here so the UX
 * intent is clear before any code ships.
 */

const STEPS = [
  {
    icon: Upload,
    title: "Upload 10–30 photos",
    body: "Variety of angles, lighting, expressions. We do the cropping and captioning automatically.",
  },
  {
    icon: Sparkles,
    title: "Train in ~5 minutes",
    body: "We fine-tune a LoRA on your connected GPU. You can keep working in another tab.",
  },
  {
    icon: Layers,
    title: "Use everywhere",
    body: "Stack your character LoRA with any prompt — portraits, fashion, video. Cross-scene consistency.",
  },
];

// Empty placeholder slots to mock the upload grid
const SLOTS = Array.from({ length: 12 });

export default function ForgeCharactersPage() {
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
          Coming soon · LoRA fine-tuning
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          Build your own characters.
          <br />
          <span className="bg-gradient-to-r from-rose-400 to-amber-500 bg-clip-text text-transparent">
            Reuse them forever.
          </span>
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-zinc-400">
          Train a personalised LoRA from a handful of photos and stack it
          with every Forge workflow — image, video, lip-sync. The same
          person shows up across every scene, on every shoot.
        </p>
      </header>

      {/* Mock training UI */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[1px]">
          <div className="rounded-xl border border-rose-500/30 bg-zinc-950/85 px-6 py-4 text-center">
            <Lock className="mx-auto h-5 w-5 text-rose-400" />
            <div className="mt-2 text-sm font-semibold text-rose-200">
              In development
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Preview of the training surface.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_280px]">
          {/* Upload grid */}
          <div className="border-b border-zinc-800 p-5 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-zinc-300">
                Reference photos
              </div>
              <span className="text-xs text-zinc-500">0 of 30</span>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {SLOTS.map((_, i) => (
                <div
                  key={i}
                  className="flex aspect-square items-center justify-center rounded-md border border-dashed border-zinc-800 bg-zinc-950"
                >
                  <ImageIcon className="h-4 w-4 text-zinc-800" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-center rounded-md border border-dashed border-zinc-700 bg-zinc-950/50 py-6 text-sm text-zinc-500">
              <Upload className="mr-2 h-4 w-4" />
              Drop photos here, or click to browse
            </div>
          </div>

          {/* Settings panel */}
          <div className="space-y-4 p-5">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Character name
              </label>
              <div className="mt-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-600">
                e.g. Maya — editorial
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Style hint (optional)
              </label>
              <div className="mt-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-600">
                a person
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
                <span>Training steps</span>
                <span className="tabular-nums text-zinc-300">1500</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-zinc-800">
                <div className="h-full w-1/2 rounded-full bg-rose-500/40" />
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                <Sparkles className="h-2.5 w-2.5" />
                Estimate
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-300">
                ~5 min · ~$0.15
              </div>
            </div>
            <button
              type="button"
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-md bg-rose-500/30 px-4 py-2 text-sm font-semibold text-rose-200/60"
            >
              <UserPlus className="h-4 w-4" />
              Start training
            </button>
          </div>
        </div>
      </div>

      {/* How it works */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-zinc-300">
          <Users className="h-4 w-4 text-rose-400" />
          <h2 className="text-base font-semibold">How character training will work</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
              >
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-rose-400" />
                  <span className="font-mono text-[10px] text-zinc-600">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-zinc-100">
                  {s.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {s.body}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Sample library (mocked, all dimmed) */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-zinc-300">
          <CheckCircle2 className="h-4 w-4 text-rose-400" />
          <h2 className="text-base font-semibold">Your character library</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {["Maya", "Alex", "Style — film noir", "Style — bright fashion"].map(
            (name) => (
              <div
                key={name}
                className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 opacity-50"
              >
                <div className="flex aspect-square items-center justify-center rounded-md bg-zinc-900 text-zinc-700">
                  <Users className="h-6 w-6" />
                </div>
                <div className="mt-2 truncate text-xs text-zinc-500">{name}</div>
              </div>
            ),
          )}
        </div>
        <p className="mt-2 text-center text-xs text-zinc-600">
          Examples shown for illustration only.
        </p>
      </section>

      {/* Notify CTA */}
      <section className="rounded-xl border border-amber-900/30 bg-gradient-to-br from-amber-950/20 to-zinc-900/40 p-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              First to know when training opens up?
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              Email{" "}
              <a
                href="mailto:hello@skyieglobal.co.uk?subject=Forge%20Characters%20Early%20Access"
                className="font-mono text-amber-400 hover:underline"
              >
                hello@skyieglobal.co.uk
              </a>{" "}
              and we&apos;ll ping you the moment it&apos;s live.
            </p>
          </div>
          <a
            href="mailto:hello@skyieglobal.co.uk?subject=Forge%20Characters%20Early%20Access"
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
