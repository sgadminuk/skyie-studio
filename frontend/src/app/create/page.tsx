import Link from "next/link";
import {
  Mic,
  Film,
  Video,
  ImagePlus,
  Sparkles,
  RefreshCw,
  Layers,
  UserCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Workflow = {
  href: string;
  icon: LucideIcon;
  title: string;
  badge?: string;
  description: string;
  features: string[];
  credits: string;
};

const WORKFLOWS: Workflow[] = [
  {
    href: "/create/studio",
    icon: Layers,
    title: "Gemini Studio",
    badge: "Premium",
    description:
      "Generate premium images and videos with Veo 3.1 and Nano Banana. Multi-image composition, text-to-video with synchronized audio, inpainting, and more — all in one unified canvas.",
    features: [
      "Veo 3.1 video (1080p + audio)",
      "Nano Banana image gen",
      "Up to 10-image composition",
      "Image editing + inpainting",
    ],
    credits: "8–480 credits",
  },
  {
    href: "/create/multi-shot",
    icon: Film,
    title: "Multi-Shot Studio",
    badge: "New",
    description:
      "Render 1–10 Veo 3.1 shots concurrently — each with its own prompt and reference images (or first frame) — then stitch them into a single MP4 with optional crossfades and background music.",
    features: [
      "Up to 10 Veo 3.1 shots",
      "Per-shot reference images (1–3)",
      "Hard-cut or crossfade stitch",
      "Gemini Flash prompt assist",
    ],
    credits: "~60–480 credits",
  },
  {
    href: "/create/avatar-pack",
    icon: UserCircle,
    title: "AI Avatar Pack",
    badge: "New",
    description:
      "Upload one photo, get a pack of 10–60 diverse portraits — LinkedIn, beach, party, traditional, gym, group shots — all the same person, different scenes, expressions, outfits.",
    features: [
      "One reference photo",
      "Auto-generated diverse prompts (Gemini Flash)",
      "Identity-preserving (Nano Banana)",
      "Per-image retry & resume",
    ],
    credits: "8 credits per avatar",
  },
  {
    href: "/create/director",
    icon: Sparkles,
    title: "AI Director",
    badge: "New",
    description:
      "Describe your idea in one sentence and AI handles everything — script, visuals, voice, music, and editing. Zero manual work.",
    features: ["One-prompt input", "Auto script writing", "Full audio mix", "Template library"],
    credits: "30 credits",
  },
  {
    href: "/create/shots",
    icon: ImagePlus,
    title: "Shot Creator",
    badge: "New",
    description:
      "Upload up to 20 images per shot, add motion prompts, and generate a fully stitched video. Supports watermark removal and aspect ratio transforms.",
    features: ["Image-to-video", "Up to 20 images/shot", "Watermark removal", "Aspect ratio control"],
    credits: "20 credits",
  },
  {
    href: "/create/v2v",
    icon: RefreshCw,
    title: "Video Transform",
    badge: "New",
    description:
      "Transform existing videos with AI — change style, extend duration, or apply creative effects. Upload a video and describe the transformation.",
    features: ["Video-to-video", "Video extend", "Style transfer", "Duration control"],
    credits: "10–15 credits",
  },
  {
    href: "/create/talking-head",
    icon: Mic,
    title: "Talking Head",
    description:
      "Create a professional talking head video from a script. Upload an avatar photo, choose a voice, and let AI bring it to life with lip-sync animation and background generation.",
    features: ["AI voice synthesis", "Lip-sync animation", "AI background", "Auto captions"],
    credits: "10 credits",
  },
  {
    href: "/create/broll",
    icon: Film,
    title: "B-Roll",
    description:
      "Generate cinematic B-roll from text prompts. Each scene becomes an AI-generated video clip, stitched together with transitions and background music.",
    features: ["Multi-scene generation", "AI music", "Crossfade transitions", "Custom styles"],
    credits: "15 credits",
  },
  {
    href: "/create/production",
    icon: Video,
    title: "Full Production",
    description:
      "The complete script-to-video pipeline. Write a script with [TALKING] and [BROLL:] markers, and Skyie Studio produces a fully finished video with all elements.",
    features: ["Script parsing", "Mixed segments", "Full audio mix", "Production-ready output"],
    credits: "25 credits",
  },
];

export default function CreatePage() {
  return (
    <div className="flex flex-col gap-[clamp(32px,5vh,64px)]">
      <header className="flex flex-col gap-3">
        <span className="text-mono-sm text-ink/40">CREATE · 09 WORKFLOWS</span>
        <h1 className="text-h2 text-ink">Choose a workflow.</h1>
        <p className="text-ink/60 max-w-[60ch]">
          Each workflow is a different pipeline. Premium and New tags mark
          recently shipped capabilities.
        </p>
      </header>

      <div className="grid gap-[1px] sm:grid-cols-2 lg:grid-cols-3 bg-ink/15">
        {WORKFLOWS.map((wf, i) => (
          <Link
            key={wf.href}
            href={wf.href}
            className="group relative bg-paper p-6 flex flex-col gap-5 transition-colors hover:bg-ink/5"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-mono-sm text-ink/40">
                {String(i + 1).padStart(2, "0")}
              </span>
              <wf.icon className="h-5 w-5 text-ink/55 group-hover:text-signal transition-colors" />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-3">
                <h2 className="text-h3 text-ink">{wf.title}</h2>
                {wf.badge && (
                  <span className="text-mono-sm tracking-[0.18em] text-signal">
                    {wf.badge}
                  </span>
                )}
              </div>
              <p className="text-sm text-ink/70 leading-relaxed">
                {wf.description}
              </p>
            </div>

            <ul className="flex flex-col gap-1.5 list-none p-0 mt-auto">
              {wf.features.map((f) => (
                <li
                  key={f}
                  className="text-mono-sm text-ink/65 flex items-baseline gap-2"
                >
                  <span aria-hidden className="text-signal">›</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between border-t border-ink/15 pt-3">
              <span className="text-mono-sm text-ink/40">{wf.credits}</span>
              <span
                aria-hidden
                className="text-mono-sm text-ink/30 group-hover:text-ink transition-colors"
              >
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
