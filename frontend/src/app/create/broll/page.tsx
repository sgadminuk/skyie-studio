"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Film, Loader2, Plus, Trash2 } from "lucide-react";
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
import { generateBroll } from "@/lib/api";
import { toast } from "sonner";

interface Scene {
  prompt: string;
  duration: number;
}

export default function BrollPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([
    { prompt: "", duration: 5 },
  ]);
  const [style, setStyle] = useState("cinematic, professional");
  const [generateMusic, setGenerateMusic] = useState(true);
  const [musicPrompt, setMusicPrompt] = useState(
    "Upbeat corporate background music"
  );
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">B-Roll</h1>
        <p className="text-muted-foreground mt-1">
          Generate cinematic B-roll from text prompts
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Scenes */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Film className="h-4 w-4" />
                Scenes
              </CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addScene}>
                <Plus className="mr-1 h-3 w-3" />
                Add Scene
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {scenes.map((scene, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Scene {i + 1}</Label>
                  {scenes.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeScene(i)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Textarea
                  placeholder="Describe this scene..."
                  value={scene.prompt}
                  onChange={(e) => updateScene(i, "prompt", e.target.value)}
                  rows={2}
                  className="resize-none"
                />
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Duration:</Label>
                  <Input
                    type="number"
                    min={2}
                    max={30}
                    value={scene.duration}
                    onChange={(e) =>
                      updateScene(i, "duration", Number(e.target.value))
                    }
                    className="w-20 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">seconds</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Style & Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Visual Style</Label>
              <Input
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="e.g., cinematic, anime, documentary..."
              />
            </div>

            <div className="space-y-2">
              <Label>Resolution</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080x1920">Portrait (1080x1920)</SelectItem>
                  <SelectItem value="1920x1080">Landscape (1920x1080)</SelectItem>
                  <SelectItem value="1080x1080">Square (1080x1080)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="genMusic"
                checked={generateMusic}
                onChange={(e) => setGenerateMusic(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="genMusic">Generate background music</Label>
            </div>

            {generateMusic && (
              <div className="space-y-2">
                <Label>Music Prompt</Label>
                <Input
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  placeholder="Describe the music..."
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!scenes.some((s) => s.prompt.trim()) || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Film className="mr-2 h-4 w-4" />
              Generate B-Roll ({scenes.filter((s) => s.prompt.trim()).length}{" "}
              scene{scenes.filter((s) => s.prompt.trim()).length !== 1 ? "s" : ""})
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
