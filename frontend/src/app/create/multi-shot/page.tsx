"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Upload, X, Sparkles, Film } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  estimateVeoMultiShot,
  generateVeoMultiShot,
  uploadAvatar,
  type MultiShotEstimate,
  type VeoMultiShotParams,
} from "@/lib/api";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_SHOTS = 10;
const MAX_REFS_PER_SHOT = 3;

type RefImage = { path: string; preview: string };

interface ShotDraft {
  id: string;
  prompt: string;
  duration_sec: 4 | 6 | 8;
  references: RefImage[];
  first_frame: RefImage | null;
  negative_prompt: string;
}

function newShot(): ShotDraft {
  return {
    id: crypto.randomUUID(),
    prompt: "",
    duration_sec: 8,
    references: [],
    first_frame: null,
    negative_prompt: "",
  };
}

function previewUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("blob:")) return path;
  return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export default function MultiShotPage() {
  const router = useRouter();
  const [shots, setShots] = useState<ShotDraft[]>([newShot()]);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("9:16");
  const [resolution, setResolution] = useState<"720p" | "1080p">("1080p");
  const [stitchMode, setStitchMode] = useState<"hard_cut" | "crossfade">("hard_cut");
  const [crossfadeSec, setCrossfadeSec] = useState(0.5);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState("Cinematic background music");
  const [enhancePrompts, setEnhancePrompts] = useState(false);
  const [estimate, setEstimate] = useState<MultiShotEstimate | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const params: VeoMultiShotParams = useMemo(
    () => ({
      shots: shots.map((s) => ({
        prompt: s.prompt,
        duration_sec: s.duration_sec,
        reference_image_paths: s.references.map((r) => r.path),
        first_frame_image_path: s.first_frame?.path ?? null,
        negative_prompt: s.negative_prompt || null,
      })),
      aspect_ratio: aspectRatio,
      resolution,
      stitch: { mode: stitchMode, crossfade_duration_sec: crossfadeSec },
      music: { enabled: musicEnabled, prompt: musicPrompt },
      enhance_prompts: enhancePrompts,
      concurrency: 3,
    }),
    [
      shots,
      aspectRatio,
      resolution,
      stitchMode,
      crossfadeSec,
      musicEnabled,
      musicPrompt,
      enhancePrompts,
    ],
  );

  // Debounced cost estimate — only when every shot has a non-empty prompt
  // (otherwise the backend rejects with 422 and we'd spam errors as the user types).
  useEffect(() => {
    const ready = shots.length > 0 && shots.every((s) => s.prompt.trim().length > 0);
    if (!ready) {
      setEstimate(null);
      return;
    }
    const t = setTimeout(() => {
      estimateVeoMultiShot(params)
        .then(setEstimate)
        .catch(() => setEstimate(null));
    }, 400);
    return () => clearTimeout(t);
  }, [params, shots]);

  function updateShot(id: string, patch: Partial<ShotDraft>) {
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addShot() {
    if (shots.length >= MAX_SHOTS) return;
    setShots((prev) => [...prev, newShot()]);
  }

  function removeShot(id: string) {
    setShots((prev) => (prev.length === 1 ? prev : prev.filter((s) => s.id !== id)));
  }

  async function handleUploadRefs(shotId: string, files: FileList | null) {
    if (!files?.length) return;
    const shot = shots.find((s) => s.id === shotId);
    if (!shot) return;
    const room = MAX_REFS_PER_SHOT - shot.references.length;
    if (room <= 0) {
      toast.error(`Max ${MAX_REFS_PER_SHOT} reference images per shot`);
      return;
    }
    const slice = Array.from(files).slice(0, room);
    try {
      const uploaded: RefImage[] = [];
      for (const file of slice) {
        const result = await uploadAvatar(file);
        uploaded.push({
          path: result.path,
          preview: URL.createObjectURL(file),
        });
      }
      updateShot(shotId, {
        references: [...shot.references, ...uploaded],
        first_frame: null,
      });
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    }
  }

  async function handleUploadFirstFrame(shotId: string, file: File | null) {
    if (!file) return;
    try {
      const result = await uploadAvatar(file);
      updateShot(shotId, {
        first_frame: { path: result.path, preview: URL.createObjectURL(file) },
        references: [],
      });
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    }
  }

  function removeRef(shotId: string, refPath: string) {
    const shot = shots.find((s) => s.id === shotId);
    if (!shot) return;
    updateShot(shotId, {
      references: shot.references.filter((r) => r.path !== refPath),
    });
  }

  async function submit() {
    if (shots.some((s) => !s.prompt.trim())) {
      toast.error("Every shot needs a prompt");
      return;
    }
    setSubmitting(true);
    try {
      const result = await generateVeoMultiShot(params);
      toast.success(`Queued ${result.shot_count} shots`);
      router.push(`/jobs/${result.job_id}`);
    } catch (e) {
      const msg =
        // axios-style error shape
        (e as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
        (e as Error).message;
      toast.error(`Submit failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container mx-auto max-w-6xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Film className="h-7 w-7" />
            Multi-shot studio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Up to 10 Veo 3.1 shots, each with its own reference images and prompt — stitched into one MP4.
          </p>
        </div>
        <Badge variant="outline">Veo 3.1</Badge>
      </div>

      {/* ── Global config ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Output</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label>Aspect</Label>
            <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as "16:9" | "9:16")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="9:16">9:16 (vertical)</SelectItem>
                <SelectItem value="16:9">16:9 (horizontal)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Resolution</Label>
            <Select value={resolution} onValueChange={(v) => setResolution(v as "720p" | "1080p")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1080p">1080p</SelectItem>
                <SelectItem value="720p">720p</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Stitch</Label>
            <Select value={stitchMode} onValueChange={(v) => setStitchMode(v as "hard_cut" | "crossfade")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hard_cut">Hard cut</SelectItem>
                <SelectItem value="crossfade">Crossfade</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {stitchMode === "crossfade" && (
            <div>
              <Label>Fade (s)</Label>
              <Input
                type="number"
                step={0.1}
                min={0.1}
                max={2.0}
                value={crossfadeSec}
                onChange={(e) => setCrossfadeSec(Number(e.target.value) || 0.5)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Music + Enhance ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Audio &amp; assist</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={musicEnabled}
                onChange={(e) => setMusicEnabled(e.target.checked)}
              />
              Add background music
            </label>
            {musicEnabled && (
              <Input
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                placeholder="Music description"
              />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enhancePrompts}
              onChange={(e) => setEnhancePrompts(e.target.checked)}
            />
            <Sparkles className="h-4 w-4" />
            Enhance prompts via Gemini Flash (recommended for short briefs)
          </label>
        </CardContent>
      </Card>

      {/* ── Shots ── */}
      <div className="space-y-4">
        {shots.map((shot, idx) => (
          <ShotCard
            key={shot.id}
            index={idx}
            shot={shot}
            onChange={(patch) => updateShot(shot.id, patch)}
            onRemove={() => removeShot(shot.id)}
            onUploadRefs={(files) => handleUploadRefs(shot.id, files)}
            onUploadFirstFrame={(file) => handleUploadFirstFrame(shot.id, file)}
            onRemoveRef={(refPath) => removeRef(shot.id, refPath)}
            removable={shots.length > 1}
          />
        ))}
        {shots.length < MAX_SHOTS && (
          <Button variant="outline" onClick={addShot} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add shot ({shots.length}/{MAX_SHOTS})
          </Button>
        )}
      </div>

      {/* ── Estimate + submit ── */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="space-y-1">
            {estimate ? (
              <>
                <div className="text-sm">
                  <span className="font-medium">{estimate.shot_count}</span> shots
                  · <span className="font-medium">{estimate.total_duration_sec}s</span> total
                  · <span className="font-medium">${estimate.estimated_cost_usd.toFixed(2)}</span> est.
                </div>
                <div className={`text-xs ${estimate.sufficient ? "text-muted-foreground" : "text-destructive"}`}>
                  {estimate.credits_required} credits required · you have {estimate.user_credits}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Enter a prompt for each shot to see cost estimate</div>
            )}
          </div>
          <Button
            size="lg"
            disabled={submitting || !estimate || !estimate.sufficient}
            onClick={submit}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Film className="h-4 w-4 mr-2" />}
            Render
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Shot card ─────────────────────────────────────────────────────────────

interface ShotCardProps {
  index: number;
  shot: ShotDraft;
  onChange: (patch: Partial<ShotDraft>) => void;
  onRemove: () => void;
  onUploadRefs: (files: FileList | null) => void;
  onUploadFirstFrame: (file: File | null) => void;
  onRemoveRef: (refPath: string) => void;
  removable: boolean;
}

function ShotCard({
  index, shot, onChange, onRemove,
  onUploadRefs, onUploadFirstFrame, onRemoveRef, removable,
}: ShotCardProps) {
  const refsInputRef = useRef<HTMLInputElement>(null);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const usingFirstFrame = !!shot.first_frame;

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="text-base">Shot {index + 1}</CardTitle>
        {removable && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Prompt</Label>
          <Textarea
            value={shot.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
            placeholder='e.g., A Tamil reviewer says "சம்பவம் அத்யாயம் ஒன்னு..."'
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Duration</Label>
            <Select
              value={String(shot.duration_sec)}
              onValueChange={(v) => onChange({ duration_sec: Number(v) as 4 | 6 | 8 })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4s</SelectItem>
                <SelectItem value="6">6s</SelectItem>
                <SelectItem value="8">8s</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Negative prompt (optional)</Label>
            <Input
              value={shot.negative_prompt}
              onChange={(e) => onChange({ negative_prompt: e.target.value })}
              placeholder="blurry, distorted, watermark"
            />
          </div>
        </div>

        {/* Reference images vs first frame — mutually exclusive in Veo 3.1. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Reference images (1–3)</Label>
              <span className="text-xs text-muted-foreground">For consistent character / subject</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {shot.references.map((r) => (
                <div key={r.path} className="relative group">
                  <img src={r.preview || previewUrl(r.path)} alt="" className="h-20 w-20 object-cover rounded" />
                  <button
                    onClick={() => onRemoveRef(r.path)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {shot.references.length < MAX_REFS_PER_SHOT && !usingFirstFrame && (
                <button
                  onClick={() => refsInputRef.current?.click()}
                  className="h-20 w-20 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground hover:bg-accent"
                >
                  <Upload className="h-5 w-5" />
                </button>
              )}
            </div>
            <input
              ref={refsInputRef}
              type="file"
              multiple
              accept="image/*"
              hidden
              onChange={(e) => {
                onUploadRefs(e.target.files);
                e.target.value = "";
              }}
            />
            {usingFirstFrame && (
              <p className="text-xs text-muted-foreground">Disabled while a first-frame image is set.</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>First frame (alternative)</Label>
              <span className="text-xs text-muted-foreground">For exact start frame</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {shot.first_frame ? (
                <div className="relative group">
                  <img
                    src={shot.first_frame.preview || previewUrl(shot.first_frame.path)}
                    alt=""
                    className="h-20 w-20 object-cover rounded"
                  />
                  <button
                    onClick={() => onChange({ first_frame: null })}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                shot.references.length === 0 && (
                  <button
                    onClick={() => firstFrameInputRef.current?.click()}
                    className="h-20 w-20 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground hover:bg-accent"
                  >
                    <Upload className="h-5 w-5" />
                  </button>
                )
              )}
            </div>
            <input
              ref={firstFrameInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                onUploadFirstFrame(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            {shot.references.length > 0 && (
              <p className="text-xs text-muted-foreground">Disabled while reference images are set.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
