"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, ArrowRight } from "lucide-react";
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
import { generateV2V, generateExtend } from "@/lib/api";
import { toast } from "sonner";

export default function V2VPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"v2v" | "extend">("v2v");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoPath, setVideoPath] = useState("");
  const [videoPreview, setVideoPreview] = useState("");
  const [prompt, setPrompt] = useState("");
  const [strength, setStrength] = useState(0.7);
  const [style, setStyle] = useState("");
  const [extendSeconds, setExtendSeconds] = useState(5);
  const [direction, setDirection] = useState("forward");
  const [resolution, setResolution] = useState("1920x1080");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please upload a video file");
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      toast.error("Video must be under 500MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = localStorage.getItem("skyie_access_token");
      const res = await fetch(`${API_URL}/api/v1/assets/videos/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setVideoPath(data.path);
      setVideoPreview(URL.createObjectURL(file));
      toast.success("Video uploaded");
    } catch {
      toast.error("Failed to upload video");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!videoPath || submitting) return;

    const [width, height] = resolution.split("x").map(Number);
    setSubmitting(true);

    try {
      let result;
      if (mode === "v2v") {
        result = await generateV2V({
          source_video: videoPath,
          prompt,
          strength,
          style,
          width,
          height,
        });
      } else {
        result = await generateExtend({
          source_video: videoPath,
          prompt,
          extend_seconds: extendSeconds,
          direction,
        });
      }
      toast.success(`${mode === "v2v" ? "Transform" : "Extend"} started`);
      router.push(`/jobs/${result.job_id}`);
    } catch {
      toast.error("Failed to start generation");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-h2 text-ink">Video Transform</h1>
        <p className="text-ink/60 mt-1">
          Transform or extend existing videos with AI
        </p>
      </div>

      <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleUpload} />

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <Button variant={mode === "v2v" ? "default" : "outline"} onClick={() => setMode("v2v")}>
          Video-to-Video
        </Button>
        <Button variant={mode === "extend" ? "default" : "outline"} onClick={() => setMode("extend")}>
          Extend Video
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Source Video</CardTitle>
          </CardHeader>
          <CardContent>
            {videoPreview ? (
              <div className="space-y-2">
                <video src={videoPreview} controls className="w-full rounded-lg max-h-64 object-contain bg-black" />
                <Button type="button" variant="outline" size="sm" onClick={() => { setVideoPath(""); setVideoPreview(""); }}>
                  Remove
                </Button>
              </div>
            ) : (
              <button type="button"
                className="w-full h-40 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 mb-2" />
                    <span className="text-sm">Upload a video (max 500MB)</span>
                  </>
                )}
              </button>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {mode === "v2v" ? "Transform Settings" : "Extend Settings"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea
                placeholder={mode === "v2v" ? "Describe the transformation..." : "Describe what happens next..."}
                value={prompt} onChange={(e) => setPrompt(e.target.value)}
                rows={3} className="resize-none"
              />
            </div>

            {mode === "v2v" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Strength ({Math.round(strength * 100)}%)</Label>
                    <input type="range" min={0} max={100} value={strength * 100}
                      onChange={(e) => setStrength(Number(e.target.value) / 100)}
                      className="w-full" />
                    <p className="text-xs text-muted-foreground">
                      Low = subtle changes, High = dramatic transformation
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Style</Label>
                    <Select value={style} onValueChange={setStyle}>
                      <SelectTrigger><SelectValue placeholder="Optional style" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        <SelectItem value="anime">Anime</SelectItem>
                        <SelectItem value="cinematic">Cinematic</SelectItem>
                        <SelectItem value="watercolor">Watercolor</SelectItem>
                        <SelectItem value="oil_painting">Oil Painting</SelectItem>
                        <SelectItem value="cyberpunk">Cyberpunk</SelectItem>
                        <SelectItem value="noir">Film Noir</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Resolution</Label>
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1920x1080">1920×1080 (16:9)</SelectItem>
                      <SelectItem value="1080x1920">1080×1920 (9:16)</SelectItem>
                      <SelectItem value="1080x1080">1080×1080 (1:1)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Extend Duration</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={1} max={30} value={extendSeconds}
                      onChange={(e) => setExtendSeconds(Number(e.target.value))}
                      className="w-24" />
                    <span className="text-sm text-muted-foreground">seconds</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select value={direction} onValueChange={setDirection}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="forward">Forward (extend end)</SelectItem>
                      <SelectItem value="backward">Backward (extend start)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={!videoPath || submitting}>
          {submitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
          ) : (
            <><ArrowRight className="mr-2 h-4 w-4" />{mode === "v2v" ? "Transform Video" : `Extend +${extendSeconds}s`}</>
          )}
        </Button>
      </form>
    </div>
  );
}
