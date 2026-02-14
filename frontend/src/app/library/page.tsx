"use client";

import { useEffect, useState, useRef } from "react";
import {
  Video,
  Image as ImageIcon,
  Mic2,
  Download,
  Trash2,
  Upload,
  Play,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getVideos,
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
  const [avatars, setAvatars] = useState<AssetItem[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);

  function fetchAll() {
    setLoading(true);
    Promise.all([getVideos(), getAvatars(), getVoices()])
      .then(([v, a, vo]) => {
        setVideos(v);
        setAvatars(a);
        setVoices(vo);
      })
      .catch(() => toast.error("Failed to load assets"))
      .finally(() => setLoading(false));
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
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <p className="text-muted-foreground mt-1">
          Manage your generated videos, avatars, and voices
        </p>
      </div>

      <Tabs defaultValue="videos">
        <TabsList>
          <TabsTrigger value="videos" className="gap-2">
            <Video className="h-4 w-4" />
            Videos ({videos.length})
          </TabsTrigger>
          <TabsTrigger value="avatars" className="gap-2">
            <ImageIcon className="h-4 w-4" />
            Avatars ({avatars.length})
          </TabsTrigger>
          <TabsTrigger value="voices" className="gap-2">
            <Mic2 className="h-4 w-4" />
            Voices ({voices.length})
          </TabsTrigger>
        </TabsList>

        {/* Videos */}
        <TabsContent value="videos" className="mt-4">
          {videos.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Video className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium">No videos yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Generated videos will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((video) => {
                const videoUrl = video.url.startsWith("http")
                  ? video.url
                  : `${API_URL}${video.url}`;
                const isPlaying = playingVideo === video.filename;
                return (
                  <Card key={video.filename} className="overflow-hidden">
                    <div className="aspect-video bg-black relative">
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
                          className="w-full h-full flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors"
                          onClick={() => setPlayingVideo(video.filename)}
                        >
                          <Play className="h-10 w-10 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium truncate">
                        {video.filename}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(video.size_bytes / 1024 / 1024).toFixed(1)} MB
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          asChild
                        >
                          <a href={videoUrl} download>
                            <Download className="mr-1 h-3 w-3" />
                            Download
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const jobId = video.path
                              .split("/")
                              .find(
                                (seg) =>
                                  seg.length > 30 && seg.includes("-")
                              );
                            if (jobId) handleDeleteVideo(jobId);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Avatars */}
        <TabsContent value="avatars" className="mt-4">
          <div className="mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => avatarInputRef.current?.click()}
            >
              <Upload className="mr-2 h-3 w-3" />
              Upload Avatar
            </Button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarUpload(file);
              }}
            />
          </div>
          {avatars.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ImageIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium">No avatars uploaded</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload avatar photos from the Talking Head workflow
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {avatars.map((avatar) => {
                const avatarUrl = avatar.url.startsWith("http")
                  ? avatar.url
                  : `${API_URL}${avatar.url}`;
                return (
                  <Card key={avatar.filename} className="overflow-hidden">
                    <div className="aspect-square bg-muted">
                      <img
                        src={avatarUrl}
                        alt={avatar.filename}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                    <CardContent className="p-3">
                      <p className="text-xs font-medium truncate">
                        {avatar.filename}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Voices */}
        <TabsContent value="voices" className="mt-4">
          <div className="mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => voiceInputRef.current?.click()}
            >
              <Upload className="mr-2 h-3 w-3" />
              Upload Voice Reference
            </Button>
            <input
              ref={voiceInputRef}
              type="file"
              accept="audio/wav,audio/mp3,audio/mpeg,audio/ogg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleVoiceUpload(file);
              }}
            />
          </div>
          {voices.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Mic2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium">No voices available</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {voices.map((voice) => (
                <Card key={voice.id}>
                  <CardContent className="flex items-center gap-4 py-3">
                    <Mic2 className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{voice.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {voice.language.toUpperCase()} &middot;{" "}
                        {voice.type === "builtin" ? "Built-in" : "Cloned"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
