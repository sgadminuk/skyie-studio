"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Image as ImageIcon } from "lucide-react";
import { generateForgeImage } from "@/lib/api";

const ASPECT_PRESETS = [
  { label: "Square", w: 1024, h: 1024 },
  { label: "Portrait 3:4", w: 896, h: 1216 },
  { label: "Portrait 9:16", w: 768, h: 1344 },
  { label: "Landscape 4:3", w: 1216, h: 896 },
  { label: "Landscape 16:9", w: 1344, h: 768 },
];

export default function ForgeImagePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(28);
  const [guidance, setGuidance] = useState(3.5);
  const [seed, setSeed] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await generateForgeImage({
        prompt: prompt.trim(),
        negative_prompt: negative.trim() || null,
        width,
        height,
        num_inference_steps: steps,
        guidance_scale: guidance,
        seed: seed.trim() ? Number(seed.trim()) : null,
      });
      router.push(`/jobs/${result.job_id}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Generation failed";
      setError(detail);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-amber-400">
          <ImageIcon className="h-3 w-3" />
          FLUX.1-dev · open weights · no filter
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Image</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Text-to-image on FLUX.1-dev. Photoreal, editorial, fashion — your
          hardware, your output. Credits deducted only when the GPU runs.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <label htmlFor="prompt" className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Prompt
          </label>
          <textarea
            id="prompt"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A close-up portrait of a woman by a window, soft natural light, 85mm lens, film grain, editorial fashion."
            className="mt-2 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
            required
          />
          <label htmlFor="negative" className="mt-4 block text-xs font-medium uppercase tracking-wider text-zinc-400">
            Negative prompt (optional)
          </label>
          <textarea
            id="negative"
            rows={2}
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            placeholder="cartoon, low quality, blurry, distorted hands"
            className="mt-2 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Aspect
            </label>
            <div className="mt-2 grid grid-cols-5 gap-1">
              {ASPECT_PRESETS.map((p) => {
                const active = width === p.w && height === p.h;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setWidth(p.w);
                      setHeight(p.h);
                    }}
                    className={`rounded border px-2 py-2 text-[10px] transition-colors ${
                      active
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                        : "border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    }`}
                  >
                    {p.label}
                    <div className="mt-0.5 text-[9px] tabular-nums text-zinc-500">
                      {p.w}×{p.h}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
            <div>
              <label htmlFor="steps" className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-zinc-400">
                <span>Steps</span>
                <span className="tabular-nums text-zinc-200">{steps}</span>
              </label>
              <input
                id="steps"
                type="range"
                min={10}
                max={60}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                className="mt-1 w-full accent-amber-500"
              />
            </div>
            <div>
              <label htmlFor="guidance" className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-zinc-400">
                <span>Guidance</span>
                <span className="tabular-nums text-zinc-200">{guidance.toFixed(1)}</span>
              </label>
              <input
                id="guidance"
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={guidance}
                onChange={(e) => setGuidance(Number(e.target.value))}
                className="mt-1 w-full accent-amber-500"
              />
            </div>
            <div>
              <label htmlFor="seed" className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Seed (optional)
              </label>
              <input
                id="seed"
                type="text"
                inputMode="numeric"
                value={seed}
                onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Random"
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            ~3 credits per image · ~3-5s render · cold start adds ~30-60s on first call
          </p>
          <button
            type="submit"
            disabled={!prompt.trim() || submitting}
            className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {submitting ? "Submitting…" : "Generate"}
          </button>
        </div>
      </form>
    </div>
  );
}
