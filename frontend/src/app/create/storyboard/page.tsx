"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Film,
  Mic,
  Play,
  Clock,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { EnhanceButton } from "@/components/enhance-button";
import { generateFullProduction } from "@/lib/api";
import { toast } from "sonner";

interface Scene {
  id: string;
  type: "talking" | "broll";
  prompt: string;
  duration: number;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function createDefaultScene(): Scene {
  return {
    id: generateId(),
    type: "broll",
    prompt: "",
    duration: 5,
  };
}

export default function StoryboardPage() {
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>([createDefaultScene()]);
  const [submitting, setSubmitting] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState("Upbeat background music");
  const [generateMusic, setGenerateMusic] = useState(true);

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

  function addScene() {
    setScenes((prev) => [...prev, createDefaultScene()]);
  }

  function removeScene(id: string) {
    if (scenes.length <= 1) {
      toast.error("You need at least one scene");
      return;
    }
    setScenes((prev) => prev.filter((s) => s.id !== id));
  }

  function updateScene(id: string, updates: Partial<Scene>) {
    setScenes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }

  function moveScene(id: string, direction: "up" | "down") {
    setScenes((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const emptyScenes = scenes.filter((s) => !s.prompt.trim());
    if (emptyScenes.length > 0) {
      toast.error("All scenes need a prompt");
      return;
    }

    setSubmitting(true);

    // Build script from scenes: talking scenes become script segments,
    // broll scenes become background_prompt context
    const talkingScenes = scenes.filter((s) => s.type === "talking");
    const script = talkingScenes.length > 0
      ? talkingScenes.map((s) => s.prompt).join("\n\n")
      : scenes.map((s) => s.prompt).join("\n\n");

    const backgroundPrompt = scenes
      .filter((s) => s.type === "broll")
      .map((s) => s.prompt)
      .join(". ");

    try {
      const result = await generateFullProduction({
        script,
        generate_music: generateMusic,
        music_prompt: musicPrompt,
        background_prompt: backgroundPrompt || undefined,
      });
      toast.success("Storyboard generation started");
      router.push(`/jobs/${result.job_id}`);
    } catch {
      toast.error("Failed to start generation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Storyboard Editor</h1>
        <p className="text-muted-foreground mt-1">
          Plan your video scene by scene, then generate with a single click
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Timeline Bar */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Timeline</span>
                <span className="text-muted-foreground">
                  {scenes.length} scene{scenes.length !== 1 ? "s" : ""} -- ~{totalDuration}s total
                </span>
              </div>
            </div>
            <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
              {scenes.map((scene, idx) => {
                const widthPercent = totalDuration > 0
                  ? (scene.duration / totalDuration) * 100
                  : 100 / scenes.length;
                return (
                  <div
                    key={scene.id}
                    className={`flex items-center justify-center text-xs font-medium transition-all ${
                      scene.type === "talking"
                        ? "bg-primary/70 text-primary-foreground"
                        : "bg-accent text-accent-foreground"
                    }`}
                    style={{ width: `${widthPercent}%`, minWidth: "24px" }}
                    title={`Scene ${idx + 1}: ${scene.type} (${scene.duration}s)`}
                  >
                    {scene.duration}s
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1 mt-1">
              {scenes.map((scene, idx) => (
                <div
                  key={scene.id}
                  className="text-[10px] text-muted-foreground text-center truncate"
                  style={{
                    width: `${
                      totalDuration > 0
                        ? (scene.duration / totalDuration) * 100
                        : 100 / scenes.length
                    }%`,
                    minWidth: "24px",
                  }}
                >
                  {idx + 1}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Scenes */}
        <div className="space-y-4">
          {scenes.map((scene, idx) => (
            <Card key={scene.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={idx === 0}
                      onClick={() => moveScene(scene.id, "up")}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={idx === scenes.length - 1}
                      onClick={() => moveScene(scene.id, "down")}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {idx + 1}
                    </Badge>
                    Scene
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={scene.type === "talking" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {scene.type === "talking" ? (
                      <Mic className="mr-1 h-3 w-3" />
                    ) : (
                      <Film className="mr-1 h-3 w-3" />
                    )}
                    {scene.type === "talking" ? "Talking" : "B-Roll"}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-400"
                    onClick={() => removeScene(scene.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_120px_140px]">
                  {/* Type */}
                  <div className="sm:col-span-1 space-y-2 sm:order-1 order-2">
                    <div className="flex items-center justify-between">
                      <Label>Prompt</Label>
                      <EnhanceButton
                        prompt={scene.prompt}
                        onEnhanced={(enhanced) =>
                          updateScene(scene.id, { prompt: enhanced })
                        }
                        type="video"
                      />
                    </div>
                    <Textarea
                      placeholder={
                        scene.type === "talking"
                          ? "Enter the script for this talking head segment..."
                          : "Describe the visual for this B-roll scene..."
                      }
                      value={scene.prompt}
                      onChange={(e) =>
                        updateScene(scene.id, { prompt: e.target.value })
                      }
                      rows={3}
                      className="resize-none"
                    />
                  </div>
                  <div className="space-y-2 order-1 sm:order-2">
                    <Label>Type</Label>
                    <Select
                      value={scene.type}
                      onValueChange={(v: "talking" | "broll") =>
                        updateScene(scene.id, { type: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="talking">Talking</SelectItem>
                        <SelectItem value="broll">B-Roll</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 order-3">
                    <Label>Duration (s)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      value={scene.duration}
                      onChange={(e) =>
                        updateScene(scene.id, {
                          duration: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add Scene */}
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={addScene}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Scene
        </Button>

        {/* Music Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Music</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="generateMusic"
                checked={generateMusic}
                onChange={(e) => setGenerateMusic(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="generateMusic">Generate background music</Label>
            </div>
            {generateMusic && (
              <div className="space-y-2">
                <Label>Music Prompt</Label>
                <Input
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  placeholder="Describe the music style..."
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={submitting || scenes.length === 0}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Generate Full Production ({scenes.length} scene{scenes.length !== 1 ? "s" : ""}, ~{totalDuration}s)
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
