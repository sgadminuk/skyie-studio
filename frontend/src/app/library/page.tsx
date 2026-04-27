"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Video,
  Image as ImageIcon,
  Sparkles,
  Mic2,
  Download,
  Trash2,
  Upload,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getVideos,
  getImages,
  deleteImage,
  getAvatars,
  getVoices,
  deleteVideo,
  uploadAvatar,
  type AssetItem,
  type Voice,
} from "@/lib/api";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LibraryPage() {
  const [videos, setVideos] = useState<AssetItem[]>([]);
  const [images, setImages] = useState<AssetItem[]>([]);
  const [avatars, setAvatars] = useState<AssetItem[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);

  function fetchAll() {
    setLoading(true);
    Promise.all([getVideos(), getImages(), getAvatars(), getVoices()])
      .then(([v, img, a, vo]) => {
        setVideos(v);
        setImages(img);
        setAvatars(a);
        setVoices(vo);
      })
      .catch(() => toast.error("Failed to load assets"))
      .finally(() => setLoading(false));
  }

  async function handleDeleteImage(jobId: string) {
    try {
      await deleteImage(jobId);
      setImages((prev) => prev.filter((img) => img.job_id !== jobId));
      toast.success("Image deleted");
    } catch {
      toast.error("Failed to delete image");
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function handleDeleteVideo(jobId: string) {
    try {
      await deleteVideo(jobId);
      setVideos((prev) => prev.filter((v) => !v.path.includes(jobId)));
      toast.success("Video deleted");
    } catch {
      toast.error("Failed to delete video");
    }
  }

  function handleAvatarUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    uploadAvatar(file)
      .then(() => {
        toast.success("Avatar uploaded");
        fetchAll();
      })
      .catch(() => toast.error("Failed to upload avatar"));
  }

  async function handleVoiceUpload(file: File) {
    if (!file.type.startsWith("audio/")) {
      toast.error("Please select an audio file");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    try {
      const { default: api } = await import("@/lib/api");
      await api.post("/assets/voices/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Voice reference uploaded");
      fetchAll();
    } catch {
      toast.error("Failed to upload voice");
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 mt-1" />
        </div>
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-[1px] sm:grid-cols-2 lg:grid-cols-3 bg-ink/15">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  const totals = videos.length + images.length + avatars.length + voices.length;

  return (
    <div className="flex flex-col gap-[clamp(32px,5vh,64px)]">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <span className="text-mono-sm text-ink/40">
          LIBRARY · §00 · {String(totals).padStart(3, "0")} ASSETS
        </span>
        <h1 className="text-h2 text-ink">Asset library.</h1>
        <p className="text-ink/60 max-w-[60ch]">
          Generated videos, images, uploaded avatars, and voice references — all in one place.
        </p>
      </header>

      <Tabs defaultValue="videos">
        <TabsList>
          <TabsTrigger value="videos">
            <Video className="h-4 w-4 mr-2" />
            Videos · {videos.length}
          </TabsTrigger>
          <TabsTrigger value="images">
            <Sparkles className="h-4 w-4 mr-2" />
            Images · {images.length}
          </TabsTrigger>
          <TabsTrigger value="avatars">
            <ImageIcon className="h-4 w-4 mr-2" />
            Avatars · {avatars.length}
          </TabsTrigger>
          <TabsTrigger value="voices">
            <Mic2 className="h-4 w-4 mr-2" />
            Voices · {voices.length}
          </TabsTrigger>
        </TabsList>

        {/* Videos */}
        <TabsContent value="videos">
          {videos.length === 0 ? (
            <EmptyState
              icon={Video}
              title="No videos yet."
              hint="Generated videos will appear here."
            />
          ) : (
            <div className="grid gap-[1px] sm:grid-cols-2 lg:grid-cols-3 bg-ink/15">
              {videos.map((video) => {
                const videoUrl = video.url.startsWith("http")
                  ? video.url
                  : `${API_URL}${video.url}`;
                const isPlaying = playingVideo === video.filename;
                return (
                  <article key={video.filename} className="bg-paper overflow-hidden">
                    <div className="aspect-video bg-ink/[0.06] relative">
                      {isPlaying ? (
                        <video
                          src={videoUrl}
                          controls
                          autoPlay
                          className="w-full h-full"
                          onEnded={() => setPlayingVideo(null)}
                        >
                          <track kind="captions" />
                        </video>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Play ${video.filename}`}
                          className="w-full h-full flex items-center justify-center bg-ink/[0.04] hover:bg-ink/[0.08] transition-colors"
                          onClick={() => setPlayingVideo(video.filename)}
                        >
                          <Play className="h-8 w-8 text-ink/55" />
                        </button>
                      )}
                    </div>
                    <div className="p-4 flex flex-col gap-2">
                      <p className="text-sm text-ink truncate">{video.filename}</p>
                      <p className="text-mono-sm text-ink/40">
                        {(video.size_bytes / 1024 / 1024).toFixed(1)} MB
                      </p>
                      <div className="flex gap-2 mt-1">
                        <Button variant="outline" size="sm" className="flex-1" asChild>
                          <a href={videoUrl} download>
                            <Download className="h-3 w-3" />
                            Download
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete video"
                          onClick={() => {
                            const jobId = video.path
                              .split("/")
                              .find((seg) => seg.length > 30 && seg.includes("-"));
                            if (jobId) handleDeleteVideo(jobId);
                          }}
                          className="hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Images */}
        <TabsContent value="images">
          {images.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No images yet."
              hint={
                <>
                  Generate images from{" "}
                  <Link href="/create/studio" className="text-signal hover:underline">
                    Gemini Studio
                  </Link>.
                </>
              }
            />
          ) : (
            <div className="grid gap-[1px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 bg-ink/15">
              {images.map((img) => {
                const imgUrl = img.url.startsWith("http")
                  ? img.url
                  : `${API_URL}${img.url}`;
                return (
                  <article key={img.path} className="bg-paper overflow-hidden group">
                    <Link href={img.job_id ? `/jobs/${img.job_id}` : "#"}>
                      <div className="aspect-square bg-ink/[0.06] overflow-hidden">
                        <img
                          src={imgUrl}
                          alt={img.filename}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      </div>
                    </Link>
                    <div className="p-3 flex flex-col gap-1.5">
                      <p className="text-mono-sm text-ink truncate">{img.filename}</p>
                      <p className="text-mono-sm text-ink/40">
                        {(img.size_bytes / 1024).toFixed(0)} KB
                      </p>
                      <div className="flex gap-2 mt-1">
                        <Button variant="outline" size="sm" className="flex-1 h-7" asChild>
                          <a href={imgUrl} download>
                            <Download className="h-3 w-3" />
                            Download
                          </a>
                        </Button>
                        {img.job_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 hover:text-destructive"
                            onClick={() => handleDeleteImage(img.job_id!)}
                            aria-label="Delete image"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Avatars */}
        <TabsContent value="avatars" className="flex flex-col gap-4">
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => avatarInputRef.current?.click()}
            >
              <Upload className="h-3 w-3" />
              Upload avatar
            </Button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Upload avatar image"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarUpload(file);
              }}
            />
          </div>
          {avatars.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title="No avatars uploaded."
              hint="Upload avatar photos from the Talking Head workflow."
            />
          ) : (
            <div className="grid gap-[1px] sm:grid-cols-3 lg:grid-cols-4 bg-ink/15">
              {avatars.map((avatar) => {
                const avatarUrl = avatar.url.startsWith("http")
                  ? avatar.url
                  : `${API_URL}${avatar.url}`;
                return (
                  <article key={avatar.filename} className="bg-paper overflow-hidden">
                    <div className="aspect-square bg-ink/[0.06]">
                      <img
                        src={avatarUrl}
                        alt={avatar.filename}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-mono-sm text-ink truncate">{avatar.filename}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Voices */}
        <TabsContent value="voices" className="flex flex-col gap-4">
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => voiceInputRef.current?.click()}
            >
              <Upload className="h-3 w-3" />
              Upload voice reference
            </Button>
            <input
              ref={voiceInputRef}
              type="file"
              accept="audio/wav,audio/mp3,audio/mpeg,audio/ogg"
              aria-label="Upload voice reference"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleVoiceUpload(file);
              }}
            />
          </div>
          {voices.length === 0 ? (
            <EmptyState icon={Mic2} title="No voices available." />
          ) : (
            <div className="flex flex-col gap-2">
              {voices.map((voice) => (
                <article
                  key={voice.id}
                  className="border border-ink/15 px-5 py-4 flex items-center gap-4"
                >
                  <Mic2 className="h-4 w-4 text-ink/55 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink">{voice.name}</p>
                    <p className="text-mono-sm text-ink/55 mt-1">
                      {voice.language.toUpperCase()} · {voice.type === "builtin" ? "Built-in" : "Cloned"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ElementType;
  title: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="border border-ink/15 px-6 py-16 flex flex-col items-center gap-3">
      <Icon className="h-10 w-10 text-ink/30" />
      <span className="text-h3 text-ink">{title}</span>
      {hint && <span className="text-mono-sm text-ink/55 text-center max-w-[40ch]">{hint}</span>}
    </div>
  );
}
