"use client";

import { useEffect, useState } from "react";
import { Video, Image as ImageIcon, Mic2, Loader2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getVideos, getAvatars, getVoices, type AssetItem, type Voice } from "@/lib/api";

export default function LibraryPage() {
  const [videos, setVideos] = useState<AssetItem[]>([]);
  const [avatars, setAvatars] = useState<AssetItem[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getVideos(), getAvatars(), getVoices()])
      .then(([v, a, vo]) => {
        setVideos(v);
        setAvatars(a);
        setVoices(vo);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
              {videos.map((video) => (
                <Card key={video.filename} className="overflow-hidden">
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <Video className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <CardContent className="p-4">
                    <p className="text-sm font-medium truncate">
                      {video.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(video.size_bytes / 1024 / 1024).toFixed(1)} MB
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" className="flex-1" asChild>
                        <a href={video.url} download>
                          <Download className="mr-1 h-3 w-3" />
                          Download
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="avatars" className="mt-4">
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
              {avatars.map((avatar) => (
                <Card key={avatar.filename} className="overflow-hidden">
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <CardContent className="p-3">
                    <p className="text-xs font-medium truncate">
                      {avatar.filename}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="voices" className="mt-4">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
