import Link from "next/link";
import { Mic, Film, Video, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const WORKFLOWS = [
  {
    href: "/create/talking-head",
    icon: Mic,
    title: "Talking Head",
    description:
      "Create a professional talking head video from a script. Upload an avatar photo, choose a voice, and let AI bring it to life with lip-sync animation and background generation.",
    features: ["AI voice synthesis", "Lip-sync animation", "AI background", "Auto captions"],
    credits: "10-30 credits",
  },
  {
    href: "/create/broll",
    icon: Film,
    title: "B-Roll",
    description:
      "Generate cinematic B-roll from text prompts. Each scene becomes an AI-generated video clip, stitched together with transitions and background music.",
    features: ["Multi-scene generation", "AI music", "Crossfade transitions", "Custom styles"],
    credits: "5-15 credits/scene",
  },
  {
    href: "/create/production",
    icon: Video,
    title: "Full Production",
    description:
      "The complete script-to-video pipeline. Write a script with [TALKING] and [BROLL:] markers, and Skyie Studio produces a fully finished video with all elements.",
    features: ["Script parsing", "Mixed segments", "Full audio mix", "Production-ready output"],
    credits: "20-100 credits",
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

      <div className="grid gap-6 lg:grid-cols-3">
        {WORKFLOWS.map((wf) => (
          <Link key={wf.href} href={wf.href}>
            <Card className="h-full cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <wf.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle>{wf.title}</CardTitle>
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
