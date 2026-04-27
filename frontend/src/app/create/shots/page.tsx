"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Trash2,
  Upload,
  ChevronUp,
  ChevronDown,
  Film,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateShots, uploadAvatar } from "@/lib/api";
import { toast } from "sonner";

interface ShotImage {
  file?: File;
  path: string;
  preview: string;
  prompt: string;
}

interface Shot {
  id: string;
  images: ShotImage[];
  duration: number;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ShotsPage() {
  const router = useRouter();
  const [shots, setShots] = useState<Shot[]>([
    { id: genId(), images: [], duration: 5 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [transition, setTransition] = useState("cut");
  const [removeWatermarks, setRemoveWatermarks] = useState(false);
  const [autoEnhance, setAutoEnhance] = useState(false);
  const [generateMusic, setGenerateMusic] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState("Cinematic background music");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeShot, setActiveShot] = useState<string>("");

  const RESOLUTION_MAP: Record<string, [number, number]> = {
    "16:9": [1920, 1080],
    "9:16": [1080, 1920],
    "1:1": [1080, 1080],
    "4:5": [1080, 1350],
    "2.39:1": [1920, 804],
  };

  function addShot() {
    setShots((prev) => [...prev, { id: genId(), images: [], duration: 5 }]);
  }

  function removeShot(id: string) {
    if (shots.length <= 1) return;
    setShots((prev) => prev.filter((s) => s.id !== id));
  }

  function moveShot(id: string, dir: "up" | "down") {
    setShots((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  function triggerFileUpload(shotId: string) {
    setActiveShot(shotId);
    fileInputRef.current?.click();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !activeShot) return;

    const shot = shots.find((s) => s.id === activeShot);
    if (!shot) return;

    const remaining = 20 - shot.images.length;
    if (files.length > remaining) {
      toast.error(`Maximum 20 images per shot. Can add ${remaining} more.`);
      return;
    }

    setUploading(true);
    const newImages: ShotImage[] = [];

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 20MB limit`);
        continue;
      }
      try {
        const result = await uploadAvatar(file);
        newImages.push({
          file,
          path: result.path,
          preview: URL.createObjectURL(file),
          prompt: "",
        });
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    setShots((prev) =>
      prev.map((s) =>
        s.id === activeShot
          ? { ...s, images: [...s.images, ...newImages] }
          : s
      )
    );
    setUploading(false);
    e.target.value = "";
  }

  function removeImage(shotId: string, imgIdx: number) {
    setShots((prev) =>
      prev.map((s) =>
        s.id === shotId
          ? { ...s, images: s.images.filter((_, i) => i !== imgIdx) }
          : s
      )
    );
  }

  function updateImagePrompt(shotId: string, imgIdx: number, prompt: string) {
    setShots((prev) =>
      prev.map((s) =>
        s.id === shotId
          ? {
              ...s,
              images: s.images.map((img, i) =>
                i === imgIdx ? { ...img, prompt } : img
              ),
            }
          : s
      )
    );
  }

  function updateDuration(shotId: string, duration: number) {
    setShots((prev) =>
      prev.map((s) => (s.id === shotId ? { ...s, duration } : s))
    );
  }

  const totalImages = shots.reduce((sum, s) => sum + s.images.length, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (totalImages === 0 || submitting) return;

    const [width, height] = RESOLUTION_MAP[aspectRatio] || [1920, 1080];
    setSubmitting(true);

    try {
      const result = await generateShots({
        shots: shots.map((s) => ({
          images: s.images.map((img) => img.path),
          prompts: s.images.map((img) => img.prompt),
          duration: s.duration,
        })),
        aspect_ratio: aspectRatio,
        transition,
        remove_watermarks: removeWatermarks,
        auto_enhance: autoEnhance,
        generate_music: generateMusic,
        music_prompt: musicPrompt,
        width,
        height,
      });
      toast.success("Shot generation started");
      router.push(`/jobs/${result.job_id}`);
    } catch {
      toast.error("Failed to start generation");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-h2 text-ink">Shot Creator</h1>
        <p className="text-ink/60 mt-1">
          Upload images, add motion prompts, and generate a stitched video
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Shots */}
        <div className="space-y-4">
          {shots.map((shot, shotIdx) => (
            <Card key={shot.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                      disabled={shotIdx === 0} onClick={() => moveShot(shot.id, "up")}>
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                      disabled={shotIdx === shots.length - 1} onClick={() => moveShot(shot.id, "down")}>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{shotIdx + 1}</Badge>
                    Shot
                    <Badge variant="secondary" className="text-xs">
                      {shot.images.length} image{shot.images.length !== 1 ? "s" : ""}
                    </Badge>
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Duration:</Label>
                    <Input type="number" min={1} max={30} value={shot.duration}
                      onChange={(e) => updateDuration(shot.id, Number(e.target.value))}
                      className="w-16 h-7 text-xs" />
                    <span className="text-xs text-muted-foreground">s</span>
                  </div>
                  {shots.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-ink/55 hover:text-destructive"
                      onClick={() => removeShot(shot.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Image Grid */}
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {shot.images.map((img, imgIdx) => (
                    <div key={imgIdx} className="relative group">
                      <img src={img.preview} alt={`Shot ${shotIdx + 1} Image ${imgIdx + 1}`}
                        className="h-20 w-full object-cover rounded-md border" />
                      <button type="button"
                        className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeImage(shot.id, imgIdx)}>
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                  {shot.images.length < 20 && (
                    <button type="button"
                      className="h-20 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      onClick={() => triggerFileUpload(shot.id)}
                      disabled={uploading}>
                      {uploading && activeShot === shot.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          <span className="text-[10px] mt-0.5">Add</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Per-image prompts */}
                {shot.images.length > 0 && (
                  <div className="space-y-2">
                    {shot.images.map((img, imgIdx) => (
                      <div key={imgIdx} className="flex items-start gap-2">
                        <img src={img.preview} alt="" className="h-8 w-8 object-cover rounded shrink-0 mt-1" />
                        <Input
                          placeholder={`Motion prompt for image ${imgIdx + 1}...`}
                          value={img.prompt}
                          onChange={(e) => updateImagePrompt(shot.id, imgIdx, e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add Shot */}
        <Button type="button" variant="outline" className="w-full border-dashed" onClick={addShot}>
          <Plus className="mr-2 h-4 w-4" /> Add Shot
        </Button>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Aspect Ratio</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                    <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                    <SelectItem value="4:5">4:5 (Instagram)</SelectItem>
                    <SelectItem value="2.39:1">2.39:1 (Cinematic)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transition</Label>
                <Select value={transition} onValueChange={setTransition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cut">Hard Cut</SelectItem>
                    <SelectItem value="crossfade">Crossfade</SelectItem>
                    <SelectItem value="dissolve">Dissolve</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="rmWm" checked={removeWatermarks}
                  onChange={(e) => setRemoveWatermarks(e.target.checked)}
                  className="h-4 w-4 rounded border-border" />
                <Label htmlFor="rmWm" className="text-sm">Remove watermarks</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="autoEnh" checked={autoEnhance}
                  onChange={(e) => setAutoEnhance(e.target.checked)}
                  className="h-4 w-4 rounded border-border" />
                <Label htmlFor="autoEnh" className="text-sm">Auto-enhance</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="genMus" checked={generateMusic}
                  onChange={(e) => setGenerateMusic(e.target.checked)}
                  className="h-4 w-4 rounded border-border" />
                <Label htmlFor="genMus" className="text-sm">Background music</Label>
              </div>
            </div>

            {generateMusic && (
              <div className="space-y-2">
                <Label>Music Prompt</Label>
                <Input value={musicPrompt} onChange={(e) => setMusicPrompt(e.target.value)} />
              </div>
            )}
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full"
          disabled={totalImages === 0 || submitting}>
          {submitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
          ) : (
            <><Film className="mr-2 h-4 w-4" />Generate Video ({totalImages} image{totalImages !== 1 ? "s" : ""}, {shots.length} shot{shots.length !== 1 ? "s" : ""})</>
          )}
        </Button>
      </form>
    </div>
  );
}
