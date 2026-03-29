import Link from "next/link";
import { Mic, Film, Video, ArrowRight, ImagePlus, Sparkles, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const WORKFLOWS = [
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
    credits: "10-15 credits",
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create</h1>
        <p className="text-muted-foreground mt-1">
          Choose a workflow to generate your video
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {WORKFLOWS.map((wf) => (
          <Link key={wf.href} href={wf.href}>
            <Card className="h-full cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <wf.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="flex items-center gap-2">
                    {wf.title}
                    {"badge" in wf && wf.badge && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">{wf.badge}</Badge>
                    )}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {wf.description}
                </p>
                <ul className="space-y-1">
                  {wf.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <ArrowRight className="h-3 w-3 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground/70 pt-2 border-t">
                  {wf.credits}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
