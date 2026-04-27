"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateDirector } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  { value: "general", label: "General", desc: "Flexible format for any topic" },
  { value: "explainer", label: "YouTube Explainer", desc: "Educational with visuals" },
  { value: "tiktok", label: "TikTok Hook", desc: "Short, attention-grabbing vertical" },
  { value: "product", label: "Product Demo", desc: "Showcase a product or service" },
  { value: "tutorial", label: "Tutorial", desc: "Step-by-step how-to" },
  { value: "promo", label: "Promo / Ad", desc: "Marketing promotional video" },
  { value: "news", label: "News Report", desc: "News-style reporting format" },
];

const EXAMPLE_IDEAS = [
  "Why remote work is the future of productivity",
  "5 hidden features of the iPhone most people don't know",
  "How AI is transforming the healthcare industry",
  "The science behind why we procrastinate",
  "A day in the life of a software engineer",
];

export default function DirectorPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState("cinematic, professional");
  const [template, setTemplate] = useState("general");
  const [voiceEngine, setVoiceEngine] = useState("fish_speech");
  const [language, setLanguage] = useState("en");
  const [durationTarget, setDurationTarget] = useState(45);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idea.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await generateDirector({
        idea,
        style,
        template,
        voice_engine: voiceEngine,
        language,
        duration_target: durationTarget,
      });
      toast.success("AI Director started — sit back and relax!");
      router.push(`/jobs/${result.job_id}`);
    } catch {
      toast.error("Failed to start generation");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-[clamp(24px,4vh,48px)]">
      <header className="flex flex-col gap-2">
        <span className="text-mono-sm text-ink/40">CREATE · AI DIRECTOR</span>
        <h1 className="text-h2 text-ink flex items-baseline gap-3">
          <Sparkles className="h-5 w-5 text-signal self-center" />
          AI Director.
        </h1>
        <p className="text-ink/60 max-w-[60ch]">
          One sentence in. Script, visuals, voice, music, and edits out — fully automatic.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Idea */}
        <section className="border border-ink/15 px-6 py-5 flex flex-col gap-4">
          <header className="flex items-baseline gap-3">
            <span className="text-mono-sm text-ink/40">§01</span>
            <h2 className="text-h3 text-ink">Idea.</h2>
          </header>
          <Textarea
            placeholder="Describe your video idea in one sentence…"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={3}
            className="text-lg resize-none"
          />
          <div className="flex flex-col gap-2">
            <p className="text-mono-sm text-ink/45">EXAMPLES</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_IDEAS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setIdea(ex)}
                  className="text-mono-sm tracking-[0.04em] px-2 py-1 border border-ink/15 hover:border-ink hover:bg-ink hover:text-paper transition-colors text-ink/70"
                >
                  {ex.length > 40 ? ex.slice(0, 40) + "…" : ex}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Template */}
        <section className="border border-ink/15 px-6 py-5 flex flex-col gap-4">
          <header className="flex items-baseline gap-3">
            <span className="text-mono-sm text-ink/40">§02</span>
            <h2 className="text-h3 text-ink">Template.</h2>
          </header>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-[1px] bg-ink/15">
            {TEMPLATES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTemplate(t.value)}
                className={cn(
                  "text-left p-3 transition-colors",
                  template === t.value
                    ? "bg-ink text-paper"
                    : "bg-paper text-ink hover:bg-ink/[0.04]",
                )}
              >
                <p className="text-sm">{t.label}</p>
                <p
                  className={cn(
                    "text-mono-sm mt-1",
                    template === t.value ? "text-paper/65" : "text-ink/55",
                  )}
                >
                  {t.desc}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Settings */}
        <section className="border border-ink/15 px-6 py-5 flex flex-col gap-4">
          <header className="flex items-baseline gap-3">
            <span className="text-mono-sm text-ink/40">§03</span>
            <h2 className="text-h3 text-ink">Settings.</h2>
          </header>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Visual style</Label>
              <Input
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="e.g. cinematic, anime, documentary…"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label>Voice</Label>
                <Select value={voiceEngine} onValueChange={setVoiceEngine}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fish_speech">Fish Speech</SelectItem>
                    <SelectItem value="cosy_voice">CosyVoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Duration</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={15}
                    max={180}
                    value={durationTarget}
                    onChange={(e) => setDurationTarget(Number(e.target.value))}
                    className="w-20"
                  />
                  <span className="text-mono-sm text-ink/55">sec</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Button type="submit" size="lg" className="w-full" disabled={!idea.trim() || submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              AI Director is working…
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              Generate complete video
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
