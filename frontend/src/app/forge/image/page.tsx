"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Sparkles,
  Power,
  Camera,
  Shirt,
  Package,
  Newspaper,
  Wand2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Square,
  RectangleVertical,
  RectangleHorizontal,
  Lightbulb,
} from "lucide-react";
import {
  generateForgeImage,
  forgePodStatus,
  type ForgePodState,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const ASPECT_PRESETS = [
  { label: "Square", sub: "1:1", w: 1024, h: 1024, icon: Square },
  { label: "Portrait", sub: "3:4", w: 896, h: 1216, icon: RectangleVertical },
  { label: "Story", sub: "9:16", w: 768, h: 1344, icon: RectangleVertical },
  { label: "Landscape", sub: "4:3", w: 1216, h: 896, icon: RectangleHorizontal },
  { label: "Cinema", sub: "16:9", w: 1344, h: 768, icon: RectangleHorizontal },
];

interface UseCase {
  id: string;
  label: string;
  icon: typeof Camera;
  prompt: string;
  negative: string;
  aspect: number; // index into ASPECT_PRESETS
  description: string;
}

const USE_CASES: UseCase[] = [
  {
    id: "portrait",
    label: "Portrait",
    icon: Camera,
    description: "Editorial headshots, model portfolios, headshots.",
    prompt:
      "A close-up editorial portrait of a young woman with subtle freckles, soft natural window light, shallow depth of field, shot on 85mm, warm tones, fine film grain, magazine cover quality.",
    negative: "cartoon, illustration, low quality, distorted features",
    aspect: 1,
  },
  {
    id: "fashion",
    label: "Fashion",
    icon: Shirt,
    description: "Runway-style fashion shots, look-books, brand campaigns.",
    prompt:
      "Full-body fashion editorial photograph of a model in a minimalist beige trench coat, walking through a Tokyo street at golden hour, motion-blurred background, vogue style, high contrast, cinematic.",
    negative: "blurry, low quality, distorted hands, watermark",
    aspect: 2,
  },
  {
    id: "product",
    label: "Product",
    icon: Package,
    description: "Hero shots, e-commerce thumbnails, lifestyle product imagery.",
    prompt:
      "A premium ceramic coffee mug on a polished marble countertop, soft natural side light, light steam rising, depth of field, commercial product photography, hyper-detailed, clean composition.",
    negative: "people, text, logos, low quality, blurry",
    aspect: 0,
  },
  {
    id: "editorial",
    label: "Editorial",
    icon: Newspaper,
    description: "Magazine spreads, lifestyle scenes, narrative imagery.",
    prompt:
      "A cinematic wide shot of a chef plating a dish in a moody kitchen, warm tungsten lighting, steam rising, anamorphic lens, shot on 35mm film, food magazine cover, painterly.",
    negative: "low quality, blurry, cartoon",
    aspect: 4,
  },
  {
    id: "freeform",
    label: "Free-form",
    icon: Wand2,
    description: "Anything you can describe. Start from a blank prompt.",
    prompt: "",
    negative: "",
    aspect: 0,
  },
];

const PROMPT_TIPS = [
  "Describe what you see, not what you want — \"a woman by a window\" beats \"make a portrait\".",
  "Add lighting + lens cues: \"soft window light, 85mm, shallow depth of field\" massively lifts quality.",
  "Reference real photo styles: \"editorial\", \"film grain\", \"national geographic\" all work as hints.",
  "Negative prompts catch the model's bad habits — \"distorted hands, low quality\" helps a lot.",
];

function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-normal text-zinc-200 shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

export default function ForgeImagePage() {
  const router = useRouter();
  const [activeUseCase, setActiveUseCase] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(28);
  const [guidance, setGuidance] = useState(3.5);
  const [seed, setSeed] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [podState, setPodState] = useState<ForgePodState | null>(null);

  useEffect(() => {
    forgePodStatus().then(setPodState).catch(() => {});
    const onState = (e: Event) => {
      setPodState((e as CustomEvent<ForgePodState>).detail);
    };
    window.addEventListener("forge:pod-state", onState);
    return () => window.removeEventListener("forge:pod-state", onState);
  }, []);

  const podReady =
    podState?.pod?.status === "ready" && podState?.session?.status === "active";

  const applyUseCase = (uc: UseCase) => {
    setActiveUseCase(uc.id);
    setPrompt(uc.prompt);
    setNegative(uc.negative);
    const aspect = ASPECT_PRESETS[uc.aspect];
    setWidth(aspect.w);
    setHeight(aspect.h);
  };

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
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Generation failed";
      setError(detail);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-amber-400">
          <Camera className="h-3 w-3" />
          FLUX.1-dev · open weights
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Image generation</h1>
        <p className="text-sm text-zinc-400">
          Describe what you want to see. We render it on your private GPU in
          about 3 seconds.
        </p>
      </header>

      {/* Use case picker */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Start from a use case
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {USE_CASES.map((uc) => {
            const Icon = uc.icon;
            const active = activeUseCase === uc.id;
            return (
              <button
                key={uc.id}
                type="button"
                onClick={() => applyUseCase(uc)}
                className={cn(
                  "group flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all",
                  active
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600",
                )}
                title={uc.description}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    active ? "text-amber-400" : "text-zinc-400 group-hover:text-zinc-200",
                  )}
                />
                <span
                  className={cn(
                    "text-sm font-medium",
                    active ? "text-amber-200" : "text-zinc-200",
                  )}
                >
                  {uc.label}
                </span>
                <span className="text-[10px] leading-tight text-zinc-500">
                  {uc.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Prompt — the star */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="prompt"
              className="text-xs font-semibold uppercase tracking-wider text-zinc-400"
            >
              Describe your image
            </label>
            <Tooltip text="The more visual detail you describe, the better the result.">
              <HelpCircle className="h-3.5 w-3.5 cursor-help text-zinc-500" />
            </Tooltip>
          </div>
          <textarea
            id="prompt"
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A close-up portrait of a woman by a window, soft natural light, 85mm lens, film grain, editorial fashion."
            className="mt-2 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
            required
          />

          <details className="mt-3 group">
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 marker:content-['']">
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
              Add a negative prompt (things you don&apos;t want)
            </summary>
            <textarea
              rows={2}
              value={negative}
              onChange={(e) => setNegative(e.target.value)}
              placeholder="cartoon, low quality, blurry, distorted hands, watermark"
              className="mt-2 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
            />
          </details>
        </div>

        {/* Aspect ratio */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Shape & size
            </span>
            <span className="text-[10px] tabular-nums text-zinc-500">
              {width} × {height} px
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {ASPECT_PRESETS.map((p) => {
              const active = width === p.w && height === p.h;
              const Icon = p.icon;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setWidth(p.w);
                    setHeight(p.h);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-3 transition-colors",
                    active
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                      : "border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">{p.label}</span>
                  <span className="text-[9px] tabular-nums text-zinc-500">
                    {p.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Advanced settings */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
          >
            <span>Advanced controls</span>
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {showAdvanced && (
            <div className="space-y-4 border-t border-zinc-800 p-5">
              <div>
                <label
                  htmlFor="steps"
                  className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-zinc-400"
                >
                  <span className="flex items-center gap-1.5">
                    Steps
                    <Tooltip text="More steps = sharper detail but slower. 28 is the sweet spot.">
                      <HelpCircle className="h-3 w-3 cursor-help text-zinc-500" />
                    </Tooltip>
                  </span>
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
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>fast (10)</span>
                  <span>balanced (28)</span>
                  <span>highest (60)</span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="guidance"
                  className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-zinc-400"
                >
                  <span className="flex items-center gap-1.5">
                    Prompt strength
                    <Tooltip text="How hard to push toward your prompt. Higher = more literal, less creative.">
                      <HelpCircle className="h-3 w-3 cursor-help text-zinc-500" />
                    </Tooltip>
                  </span>
                  <span className="tabular-nums text-zinc-200">
                    {guidance.toFixed(1)}
                  </span>
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
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>loose (0)</span>
                  <span>balanced (3.5)</span>
                  <span>strict (10)</span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="seed"
                  className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400"
                >
                  Seed
                  <Tooltip text="Same seed + same prompt = same image. Set one to reproduce a result.">
                    <HelpCircle className="h-3 w-3 cursor-help text-zinc-500" />
                  </Tooltip>
                </label>
                <input
                  id="seed"
                  type="text"
                  inputMode="numeric"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Random — leave blank for a new image every time"
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500/50"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {!podReady && (
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 p-4">
            <div className="flex items-start gap-3">
              <Power className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="flex-1 text-sm">
                <div className="font-medium text-amber-200">No GPU connected</div>
                <p className="mt-1 text-xs text-amber-300/80">
                  Open the home page and hit{" "}
                  <strong className="text-amber-200">Connect GPU</strong> first.
                  Generation is billed by the second only while the GPU is
                  connected.
                </p>
                <Link
                  href="/"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-700/60 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/15"
                >
                  <Power className="h-3 w-3" />
                  Go to home to connect
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">
            ~3 credits per image · ~3s render once your GPU is warm
          </p>
          <button
            type="submit"
            disabled={!prompt.trim() || submitting || !podReady}
            title={!podReady ? "Connect a GPU first" : undefined}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors",
              "bg-amber-500 text-zinc-950 hover:bg-amber-400",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {submitting ? "Sending to GPU…" : "Generate image"}
          </button>
        </div>
      </form>

      {/* Tips card */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-zinc-200">
            Tips for better images
          </h2>
        </div>
        <ul className="space-y-2 text-xs leading-relaxed text-zinc-400">
          {PROMPT_TIPS.map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400/60" />
              {t}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
