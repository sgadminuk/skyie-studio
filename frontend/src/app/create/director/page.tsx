"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const TEMPLATES = [
  { value: "general", label: "General", desc: "Flexible format for any topic" },
  { value: "explainer", label: "YouTube Explainer", desc: "Educational content with visuals" },
  { value: "tiktok", label: "TikTok Hook", desc: "Short, attention-grabbing vertical" },
  { value: "product", label: "Product Demo", desc: "Showcase a product or service" },
  { value: "tutorial", label: "Tutorial", desc: "Step-by-step how-to" },
  { value: "promo", label: "Promo/Ad", desc: "Marketing promotional video" },
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-primary" />
          AI Director
        </h1>
        <p className="text-muted-foreground mt-1">
          Describe your idea in one sentence — AI handles everything else
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Idea Input */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Idea</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Describe your video idea in one sentence..."
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={3}
              className="resize-none text-lg"
            />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Try an example:</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_IDEAS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    className="text-xs px-2 py-1 rounded-full bg-accent hover:bg-accent/80 text-accent-foreground transition-colors"
                    onClick={() => setIdea(ex)}
                  >
                    {ex.length > 40 ? ex.slice(0, 40) + "..." : ex}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Template */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Template</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    template === t.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setTemplate(t.value)}
                >
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Visual Style</Label>
              <Input value={style} onChange={(e) => setStyle(e.target.value)}
                placeholder="e.g., cinematic, anime, documentary..." />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Voice</Label>
                <Select value={voiceEngine} onValueChange={setVoiceEngine}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fish_speech">Fish Speech</SelectItem>
                    <SelectItem value="cosy_voice">CosyVoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
              <div className="space-y-2">
                <Label>Duration</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={15} max={180} value={durationTarget}
                    onChange={(e) => setDurationTarget(Number(e.target.value))}
                    className="w-20" />
                  <span className="text-sm text-muted-foreground">sec</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={!idea.trim() || submitting}>
          {submitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />AI Director is working...</>
          ) : (
            <><Wand2 className="mr-2 h-4 w-4" />Generate Complete Video</>
          )}
        </Button>
      </form>
    </div>
  );
}
