"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ImagePlus,
  Wand2,
  Layers,
  Film,
  Loader2,
  Upload,
  X,
  Sparkles,
  Volume2,
  VolumeX,
  Palette,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generateGeminiImage,
  generateGeminiImageEdit,
  generateGeminiVideo,
  getBrandProfiles,
  uploadAvatar,
  type BrandProfile,
} from "@/lib/api";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Intent = "image" | "edit" | "compose" | "video";

interface UploadedImage {
  path: string;
  preview: string;
}

const INTENTS: { id: Intent; label: string; icon: typeof ImagePlus; model: string; desc: string }[] = [
  {
    id: "image",
    label: "Image",
    icon: ImagePlus,
    model: "Nano Banana",
    desc: "Text-to-image with Gemini 2.5 Flash Image",
  },
  {
    id: "edit",
    label: "Edit",
    icon: Wand2,
    model: "Nano Banana",
    desc: "Inpaint or transform an existing image",
  },
  {
    id: "compose",
    label: "Compose",
    icon: Layers,
    model: "Nano Banana",
    desc: "Blend up to 10 reference images into one",
  },
  {
    id: "video",
    label: "Video",
    icon: Film,
    model: "Veo 3.1",
    desc: "Text-to-video or image-to-video with synchronized audio",
  },
];

export default function StudioPage() {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent>("image");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // image / edit / video single source
  const [sourceImage, setSourceImage] = useState<UploadedImage | null>(null);
  // compose multi-image (up to 10)
  const [composeImages, setComposeImages] = useState<UploadedImage[]>([]);

  // image + video controls
  const [aspectRatio, setAspectRatio] = useState("16:9");
  // video-specific
  const [duration, setDuration] = useState(8);
  const [resolution, setResolution] = useState("1080p");
  const [generateAudio, setGenerateAudio] = useState(true);

  // brand kit
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [includeLogo, setIncludeLogo] = useState(false);
  const [logoPosition, setLogoPosition] = useState("bottom-right");

  const singleInputRef = useRef<HTMLInputElement>(null);
  const multiInputRef = useRef<HTMLInputElement>(null);

  const activeIntent = useMemo(() => INTENTS.find((i) => i.id === intent)!, [intent]);
  const selectedBrand = useMemo(
    () => brands.find((b) => b.id === selectedBrandId) || null,
    [brands, selectedBrandId],
  );
  const canOverlayLogo = intent !== "video" && !!selectedBrand?.logo_url;

  useEffect(() => {
    getBrandProfiles()
      .then(setBrands)
      .catch(() => {
        // Silent — brand kit is optional for generation
      });
  }, []);

  async function handleSingleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    setUploading(true);
    try {
      const result = await uploadAvatar(file);
      setSourceImage({ path: result.path, preview: URL.createObjectURL(file) });
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleMultiUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = 10 - composeImages.length;
    if (files.length > remaining) {
      toast.error(`You can compose up to 10 images. ${remaining} slot${remaining === 1 ? "" : "s"} left.`);
      return;
    }
    setUploading(true);
    const uploaded: UploadedImage[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
      try {
        const result = await uploadAvatar(file);
        uploaded.push({ path: result.path, preview: URL.createObjectURL(file) });
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    setComposeImages((prev) => [...prev, ...uploaded]);
    setUploading(false);
    e.target.value = "";
  }

  function removeComposeImage(idx: number) {
    setComposeImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function canSubmit(): boolean {
    if (!prompt.trim()) return false;
    if (intent === "edit" && !sourceImage) return false;
    if (intent === "compose" && composeImages.length < 2) return false;
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit() || submitting) return;
    setSubmitting(true);

    const brandId = selectedBrandId || null;
    const overlayPayload = canOverlayLogo && includeLogo
      ? { include_logo_overlay: true, logo_position: logoPosition }
      : {};

    try {
      let result;
      if (intent === "image") {
        result = await generateGeminiImage({
          prompt,
          aspect_ratio: aspectRatio === "16:9" ? "16:9" : aspectRatio,
          brand_profile_id: brandId,
          ...overlayPayload,
        });
      } else if (intent === "edit") {
        result = await generateGeminiImageEdit({
          prompt,
          source_image_path: sourceImage!.path,
          brand_profile_id: brandId,
          ...overlayPayload,
        });
      } else if (intent === "compose") {
        result = await generateGeminiImage({
          prompt,
          reference_image_paths: composeImages.map((i) => i.path),
          aspect_ratio: aspectRatio,
          brand_profile_id: brandId,
          ...overlayPayload,
        });
      } else {
        result = await generateGeminiVideo({
          prompt,
          source_image_path: sourceImage?.path ?? null,
          duration_sec: duration,
          aspect_ratio: aspectRatio,
          resolution,
          generate_audio: generateAudio,
          negative_prompt: negativePrompt || null,
          brand_profile_id: brandId,
        });
      }

      toast.success(`${activeIntent.label} generation started`);
      router.push(`/jobs/${result.job_id}`);
    } catch (err) {
      const anyErr = err as { response?: { data?: { detail?: string } } };
      const detail = anyErr?.response?.data?.detail || "Failed to start generation";
      toast.error(detail);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Studio</h1>
            <Badge variant="default" className="text-[10px]">
              <Sparkles className="h-3 w-3 mr-1" />
              Gemini
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Generate images and videos with Veo 3.1 and Nano Banana. Premium quality, no compromises.
          </p>
        </div>
      </div>

      {/* Brand Kit selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            Brand Kit
            {brands.length === 0 && (
              <Badge variant="outline" className="text-[10px] ml-auto">
                None yet
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {brands.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Create a brand profile to steer generation with your tone, colors, and logo.{" "}
              <Link href="/brand/new" className="underline">
                Create one →
              </Link>
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                <div className="space-y-2">
                  <Label className="text-xs">Apply brand</Label>
                  <Select
                    value={selectedBrandId || "__none__"}
                    onValueChange={(v) => {
                      setSelectedBrandId(v === "__none__" ? "" : v);
                      if (v === "__none__") setIncludeLogo(false);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No brand" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No brand</SelectItem>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                          {b.industry ? ` — ${b.industry}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedBrand?.logo_url && (
                  <div className="h-12 w-24 rounded border bg-muted flex items-center justify-center p-1">
                    <img
                      src={
                        selectedBrand.logo_url.startsWith("http")
                          ? selectedBrand.logo_url
                          : `${API_URL}${selectedBrand.logo_url}`
                      }
                      alt={`${selectedBrand.name} logo`}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}
              </div>

              {selectedBrand && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1 text-[11px] text-muted-foreground">
                  {selectedBrand.tone_of_voice && (
                    <p>
                      <span className="font-medium text-foreground">Tone:</span>{" "}
                      {selectedBrand.tone_of_voice}
                    </p>
                  )}
                  {selectedBrand.target_audience && (
                    <p>
                      <span className="font-medium text-foreground">Audience:</span>{" "}
                      {selectedBrand.target_audience}
                    </p>
                  )}
                  <p className="italic">
                    Brand identity is prepended to your prompt so Veo/Nano Banana stays on-brand.
                  </p>
                </div>
              )}

              {canOverlayLogo && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="includeLogo"
                      checked={includeLogo}
                      onChange={(e) => setIncludeLogo(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                      aria-label="Overlay brand logo on output"
                      title="Overlay brand logo on output"
                    />
                    <Label htmlFor="includeLogo" className="text-xs">
                      Overlay logo on output image
                    </Label>
                  </div>
                  {includeLogo && (
                    <Select value={logoPosition} onValueChange={setLogoPosition}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom-right">Bottom Right</SelectItem>
                        <SelectItem value="bottom-left">Bottom Left</SelectItem>
                        <SelectItem value="top-right">Top Right</SelectItem>
                        <SelectItem value="top-left">Top Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {intent === "video" && selectedBrand && (
                <p className="text-[11px] text-muted-foreground italic">
                  Note: logo overlay is not yet available for video — only prompt injection.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Intent tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {INTENTS.map((i) => {
          const Icon = i.icon;
          const active = i.id === intent;
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => setIntent(i.id)}
              className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">{i.label}</span>
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight">{i.desc}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Source image / compose inputs */}
        {(intent === "edit" || intent === "video") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {intent === "edit" ? "Source Image" : "Starting Image (optional)"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <input
                ref={singleInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleSingleUpload}
                aria-label="Upload source image"
              />
              {sourceImage ? (
                <div className="relative inline-block">
                  <img
                    src={sourceImage.preview}
                    alt="source"
                    className="max-h-56 rounded-md border"
                  />
                  <button
                    type="button"
                    aria-label="Remove source image"
                    title="Remove"
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-1"
                    onClick={() => setSourceImage(null)}
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="h-32 w-full border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  onClick={() => singleInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      <span className="text-xs mt-1">
                        {intent === "edit" ? "Upload image to edit" : "Upload reference (optional)"}
                      </span>
                    </>
                  )}
                </button>
              )}
            </CardContent>
          </Card>
        )}

        {intent === "compose" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Reference Images</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Blend up to 10 images. Nano Banana will compose them into a single output.
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {composeImages.length}/10
              </Badge>
            </CardHeader>
            <CardContent>
              <input
                ref={multiInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleMultiUpload}
                aria-label="Upload reference images"
              />
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {composeImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={img.preview}
                      alt={`compose ${idx + 1}`}
                      className="h-24 w-full object-cover rounded-md border"
                    />
                    <button
                      type="button"
                      aria-label={`Remove reference image ${idx + 1}`}
                      title="Remove"
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeComposeImage(idx)}
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
                {composeImages.length < 10 && (
                  <button
                    type="button"
                    className="h-24 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    onClick={() => multiInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
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
              {composeImages.length === 1 && (
                <p className="text-xs text-amber-500 mt-2">
                  Add at least one more image — composition needs 2+ references.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Prompt */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prompt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder={
                intent === "video"
                  ? "Describe the scene, camera motion, lighting, mood, and any audio cues..."
                  : intent === "compose"
                  ? "Describe how the reference images should be blended..."
                  : intent === "edit"
                  ? "Describe the edit: 'replace the sky with a sunset', 'remove the watermark', 'change the hair color to silver'..."
                  : "Describe the image you want to generate in detail..."
              }
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            {intent === "video" && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Negative prompt (optional)</Label>
                <Input
                  placeholder="Things to avoid — e.g. blurry, low-res, artifacts"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                />
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
                <Label>Aspect Ratio</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 Landscape</SelectItem>
                    <SelectItem value="9:16">9:16 Portrait</SelectItem>
                    <SelectItem value="1:1">1:1 Square</SelectItem>
                    <SelectItem value="4:3">4:3</SelectItem>
                    <SelectItem value="3:4">3:4</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {intent === "video" && (
                <>
                  <div className="space-y-2">
                    <Label>Resolution</Label>
                    <Select value={resolution} onValueChange={setResolution}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1080p">1080p (Premium)</SelectItem>
                        <SelectItem value="720p">720p (Standard)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="video-duration-slider">Duration: {duration}s</Label>
                    <input
                      id="video-duration-slider"
                      type="range"
                      min={2}
                      max={8}
                      step={1}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-full"
                      aria-label="Video duration in seconds"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Audio</Label>
                    <button
                      type="button"
                      onClick={() => setGenerateAudio((v) => !v)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border w-full ${
                        generateAudio ? "border-primary bg-primary/10" : "border-border"
                      }`}
                    >
                      {generateAudio ? (
                        <>
                          <Volume2 className="h-4 w-4 text-primary" />
                          <span className="text-sm">Synchronized audio ON</span>
                        </>
                      ) : (
                        <>
                          <VolumeX className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Silent video</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>

            {intent === "video" && (
              <p className="text-[11px] text-muted-foreground pt-2 border-t">
                Veo 3.1 renders take ~2–5 minutes. You will be redirected to the job page where progress streams in real time.
              </p>
            )}
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!canSubmit() || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting {activeIntent.label.toLowerCase()}...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate with {activeIntent.model}
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
