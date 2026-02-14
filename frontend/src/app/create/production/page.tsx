"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Loader2 } from "lucide-react";
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
import { generateFullProduction } from "@/lib/api";
import { toast } from "sonner";

const EXAMPLE_SCRIPT = `[TALKING] Welcome to Skyie Studio! Today I'm going to show you how our AI video platform works.

[BROLL: Futuristic technology interface with holographic displays] This is the cutting-edge technology behind our platform.

[TALKING] With just a script, we can generate professional-quality videos in minutes.

[BROLL: Professional video editing workspace with multiple monitors] Our pipeline handles everything from voice synthesis to final export.`;

export default function ProductionPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [script, setScript] = useState("");
  const [voiceEngine, setVoiceEngine] = useState("fish_speech");
  const [language, setLanguage] = useState("en");
  const [generateMusic, setGenerateMusic] = useState(true);
  const [musicPrompt, setMusicPrompt] = useState(
    "Professional background music"
  );
  const [backgroundPrompt, setBackgroundPrompt] = useState(
    "Professional studio background"
  );

  const segments = script
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const talking = line.match(/^\[TALKING\]/i);
      const broll = line.match(/^\[BROLL:\s*(.*?)\]/i);
      if (talking) return { type: "talking" as const, text: line };
      if (broll) return { type: "broll" as const, text: line };
      return { type: "text" as const, text: line };
    });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!script.trim() || submitting) return;

    setSubmitting(true);
    try {
      const result = await generateFullProduction({
        script,
        voice_engine: voiceEngine,
        language,
        generate_music: generateMusic,
        music_prompt: musicPrompt,
        background_prompt: backgroundPrompt,
      });
      toast.success("Full production started");
      router.push(`/jobs/${result.job_id}`);
    } catch {
      toast.error("Failed to start generation");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Full Production</h1>
        <p className="text-muted-foreground mt-1">
          Write a script with markers and get a complete video
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Script Editor */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Video className="h-4 w-4" />
                Script
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setScript(EXAMPLE_SCRIPT)}
              >
                Load Example
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={`[TALKING] Your spoken text here...\n[BROLL: scene description] Optional narration\n[TALKING] More spoken text...`}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={12}
              className="resize-none font-mono text-sm"
            />

            {segments.length > 0 && segments.some((s) => s.type !== "text") && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Detected Segments:
                </p>
                <div className="flex flex-wrap gap-1">
                  {segments
                    .filter((s) => s.type !== "text")
                    .map((s, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                          s.type === "talking"
                            ? "bg-blue-500/10 text-blue-500"
                            : "bg-green-500/10 text-green-500"
                        }`}
                      >
                        {s.type === "talking" ? "Talking" : "B-Roll"} #{i + 1}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Voice Engine</Label>
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
              <div className="space-y-2">
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
            </div>

            <div className="space-y-2">
              <Label>Background Prompt (for talking segments)</Label>
              <Input
                value={backgroundPrompt}
                onChange={(e) => setBackgroundPrompt(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="prodMusic"
                checked={generateMusic}
                onChange={(e) => setGenerateMusic(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="prodMusic">Generate background music</Label>
            </div>
            {generateMusic && (
              <div className="space-y-2">
                <Label>Music Prompt</Label>
                <Input
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!script.trim() || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Video className="mr-2 h-4 w-4" />
              Generate Full Production
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
