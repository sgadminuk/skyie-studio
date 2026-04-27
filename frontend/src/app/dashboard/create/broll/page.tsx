"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Film, Loader2, Plus, Trash2 } from "lucide-react";
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
import { generateBroll } from "@/lib/api";
import { toast } from "sonner";

interface Scene {
  prompt: string;
  duration: number;
}

export default function BrollPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([{ prompt: "", duration: 5 }]);
  const [style, setStyle] = useState("cinematic, professional");
  const [generateMusic, setGenerateMusic] = useState(true);
  const [musicPrompt, setMusicPrompt] = useState("Upbeat corporate background music");
  const [resolution, setResolution] = useState("1080x1920");

  function addScene() {
    setScenes([...scenes, { prompt: "", duration: 5 }]);
  }

  function removeScene(index: number) {
    if (scenes.length <= 1) return;
    setScenes(scenes.filter((_, i) => i !== index));
  }

  function updateScene(index: number, field: keyof Scene, value: string | number) {
    const updated = [...scenes];
    updated[index] = { ...updated[index], [field]: value };
    setScenes(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validScenes = scenes.filter((s) => s.prompt.trim());
    if (validScenes.length === 0 || submitting) return;

    const [width, height] = resolution.split("x").map(Number);
    setSubmitting(true);
    try {
      const result = await generateBroll({
        scenes: validScenes,
        style,
        generate_music: generateMusic,
        music_prompt: musicPrompt,
        width,
        height,
      });
      toast.success("B-Roll generation started");
      router.push(`/jobs/${result.job_id}`);
    } catch {
      toast.error("Failed to start generation");
      setSubmitting(false);
    }
  }

  const validCount = scenes.filter((s) => s.prompt.trim()).length;

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-[clamp(24px,4vh,48px)]">
      <header className="flex flex-col gap-2">
        <span className="text-mono-sm text-ink/40">CREATE · B-ROLL</span>
        <h1 className="text-h2 text-ink flex items-baseline gap-3">
          <Film className="h-5 w-5 text-signal self-center" />
          B-roll.
        </h1>
        <p className="text-ink/60 max-w-[60ch]">
          Multi-scene cinematic B-roll from text prompts. Each scene becomes an
          AI-generated clip stitched into a single output with optional music.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Scenes */}
        <section className="border border-ink/15 px-6 py-5 flex flex-col gap-4">
          <header className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-3">
              <span className="text-mono-sm text-ink/40">§01</span>
              <h2 className="text-h3 text-ink">Scenes.</h2>
              <span className="text-mono-sm text-ink/40">
                {String(scenes.length).padStart(2, "0")} total · {String(validCount).padStart(2, "0")} ready
              </span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addScene}>
              <Plus className="h-3 w-3" />
              Add scene
            </Button>
          </header>

          <div className="flex flex-col gap-3">
            {scenes.map((scene, i) => (
              <div
                key={i}
                className="border border-ink/15 px-4 py-3 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-mono-sm text-ink/55">
                    SCENE {String(i + 1).padStart(2, "0")}
                  </span>
                  {scenes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeScene(i)}
                      aria-label={`Remove scene ${i + 1}`}
                      className="text-ink/55 hover:text-destructive transition-colors h-6 w-6 flex items-center justify-center"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <Textarea
                  placeholder="Describe this scene…"
                  value={scene.prompt}
                  onChange={(e) => updateScene(i, "prompt", e.target.value)}
                  rows={2}
                  className="resize-none"
                />
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">Duration</Label>
                  <Input
                    type="number"
                    min={2}
                    max={30}
                    value={scene.duration}
                    onChange={(e) => updateScene(i, "duration", Number(e.target.value))}
                    className="w-20 h-8 text-sm"
                  />
                  <span className="text-mono-sm text-ink/55">SEC</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Settings */}
        <section className="border border-ink/15 px-6 py-5 flex flex-col gap-4">
          <header className="flex items-baseline gap-3">
            <span className="text-mono-sm text-ink/40">§02</span>
            <h2 className="text-h3 text-ink">Settings.</h2>
          </header>

          <div className="flex flex-col gap-2">
            <Label>Visual style</Label>
            <Input
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. cinematic, anime, documentary…"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Resolution</Label>
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1080x1920">Portrait · 1080×1920</SelectItem>
                <SelectItem value="1920x1080">Landscape · 1920×1080</SelectItem>
                <SelectItem value="1080x1080">Square · 1080×1080</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={generateMusic}
              onChange={(e) => setGenerateMusic(e.target.checked)}
              className="h-4 w-4 accent-signal"
            />
            <span className="text-sm text-ink">Generate background music</span>
          </label>

          {generateMusic && (
            <div className="flex flex-col gap-2">
              <Label>Music prompt</Label>
              <Input
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                placeholder="Describe the music…"
              />
            </div>
          )}
        </section>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={validCount === 0 || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Film className="h-4 w-4" />
              Generate B-roll · {String(validCount).padStart(2, "0")} scene
              {validCount !== 1 && "s"}
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
