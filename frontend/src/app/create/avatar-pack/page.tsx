"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  estimateAvatarPack,
  generateAvatarPack,
  uploadAvatar,
  type AvatarPackEstimate,
} from "@/lib/api";
import { toast } from "sonner";

type RefImage = { path: string; preview: string };

const COUNT_OPTIONS = [10, 20, 30, 45, 60];

export default function AvatarPackPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reference, setReference] = useState<RefImage | null>(null);
  const [count, setCount] = useState(30);
  const [brief, setBrief] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [estimate, setEstimate] = useState<AvatarPackEstimate | null>(null);

  // Live cost estimate every time count changes (no upload required).
  useEffect(() => {
    if (!reference) {
      setEstimate(null);
      return;
    }
    estimateAvatarPack({
      reference_image_path: reference.path,
      count,
    })
      .then(setEstimate)
      .catch(() => setEstimate(null));
  }, [reference, count]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image");
      return;
    }
    setUploading(true);
    try {
      const result = await uploadAvatar(file);
      setReference({ path: result.path, preview: URL.createObjectURL(file) });
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit() {
    if (!reference || submitting) return;
    setSubmitting(true);
    try {
      const result = await generateAvatarPack({
        reference_image_path: reference.path,
        count,
        brief: brief.trim() || undefined,
      });
      toast.success(
        `Started ${result.count} avatars (${result.credits_used} credits)`,
      );
      router.push(`/jobs/${result.job_id}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to start avatar pack";
      toast.error(detail);
      setSubmitting(false);
    }
  }

  const canSubmit = !!reference && !submitting && !uploading;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">AI Avatar Pack</h1>
          <Badge variant="default" className="text-[10px]">
            <Sparkles className="h-3 w-3 mr-1" />
            Nano Banana
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1">
          Upload one photo. Get a pack of diverse portraits — LinkedIn,
          beach, party, traditional, gym, group shots — all the same person,
          different scenes and moods.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reference Photo</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            One clear photo of the subject. Front-facing, decent lighting.
            Identity comes from this image alone.
          </p>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
            aria-label="Upload reference photo"
          />
          {reference ? (
            <div className="relative inline-block">
              <img
                src={reference.preview}
                alt="reference"
                className="max-h-64 rounded-md border"
              />
              <button
                type="button"
                aria-label="Remove reference"
                title="Remove"
                className="absolute top-1 right-1 bg-black/60 rounded-full p-1"
                onClick={() => setReference(null)}
              >
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="h-40 w-full border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <Upload className="h-6 w-6" />
                  <span className="text-sm mt-2">Upload reference photo</span>
                </>
              )}
            </button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pack Size</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-5 gap-2">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                  count === n
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {estimate && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credits</span>
                <span
                  className={
                    estimate.sufficient
                      ? "tabular-nums"
                      : "tabular-nums text-destructive"
                  }
                >
                  {estimate.credits_required} / {estimate.user_credits} available
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider cost</span>
                <span className="tabular-nums">
                  ${estimate.estimated_cost_usd.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Steering (optional)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Optional brief to bias the prompt mix. Leave empty for the
            default broad set (LinkedIn, party, beach, gym, traditional, etc).
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="e.g. lean more towards corporate / tech founder vibes, skip nightclub scenes"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Generate {count} avatars
        </Button>
      </div>
    </div>
  );
}
