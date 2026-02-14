"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mic, Loader2, Upload, X } from "lucide-react";
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
import { generateTalkingHead, uploadAvatar } from "@/lib/api";
import { toast } from "sonner";

export default function TalkingHeadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [script, setScript] = useState("");
  const [voiceEngine, setVoiceEngine] = useState("fish_speech");
  const [language, setLanguage] = useState("en");
  const [generateBackground, setGenerateBackground] = useState(true);
  const [backgroundPrompt, setBackgroundPrompt] = useState(
    "Professional studio background, soft lighting"
  );
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | undefined>();

  const charCount = script.length;

  function handleAvatarSelect(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (PNG, JPG)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }
    setAvatarPreview(URL.createObjectURL(file));
    setUploadingAvatar(true);
    uploadAvatar(file)
      .then((data) => {
        setAvatarPath(data.path || data.filename);
        toast.success("Avatar uploaded");
      })
      .catch(() => {
        toast.error("Failed to upload avatar");
        setAvatarPreview(null);
      })
      .finally(() => setUploadingAvatar(false));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleAvatarSelect(file);
  }

  function clearAvatar() {
    setAvatarPreview(null);
    setAvatarPath(undefined);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!script.trim() || submitting) return;

    setSubmitting(true);
    try {
      const result = await generateTalkingHead({
        script,
        avatar_path: avatarPath,
        voice_engine: voiceEngine,
        language,
        generate_background: generateBackground,
        background_prompt: backgroundPrompt,
      });
      toast.success("Generation started");
      router.push(`/jobs/${result.job_id}`);
    } catch {
      toast.error("Failed to start generation");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Talking Head</h1>
        <p className="text-muted-foreground mt-1">
          Create a professional talking head video from a script
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Script */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Script
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              placeholder="Enter the text your avatar will speak..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {charCount} characters
            </p>
          </CardContent>
        </Card>

        {/* Avatar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avatar</CardTitle>
          </CardHeader>
          <CardContent>
            {avatarPreview ? (
              <div className="relative inline-block">
                <img
                  src={avatarPreview}
                  alt="Avatar preview"
                  className="h-32 w-32 rounded-lg object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={clearAvatar}
                >
                  <X className="h-3 w-3" />
                </Button>
                {uploadingAvatar && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
              </div>
            ) : (
              <div
                className="flex items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-muted-foreground/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Drag & drop an avatar photo, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PNG, JPG up to 10MB. Leave empty for default.
                  </p>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarSelect(file);
              }}
            />
          </CardContent>
        </Card>

        {/* Voice Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voice Settings</CardTitle>
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
          </CardContent>
        </Card>

        {/* Background */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Background</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="generateBg"
                checked={generateBackground}
                onChange={(e) => setGenerateBackground(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="generateBg">Generate AI background</Label>
            </div>
            {generateBackground && (
              <div className="space-y-2">
                <Label>Background Prompt</Label>
                <Input
                  value={backgroundPrompt}
                  onChange={(e) => setBackgroundPrompt(e.target.value)}
                  placeholder="Describe the background..."
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
          disabled={!script.trim() || submitting || uploadingAvatar}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Mic className="mr-2 h-4 w-4" />
              Generate Talking Head
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
