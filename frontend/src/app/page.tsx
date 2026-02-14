"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Video,
  Mic,
  Film,
  Wand2,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getJobs, type Job } from "@/lib/api";

const STATUS_CONFIG = {
  queued: { icon: Clock, variant: "secondary" as const, label: "Queued" },
  processing: { icon: Loader2, variant: "default" as const, label: "Processing" },
  completed: { icon: CheckCircle2, variant: "default" as const, label: "Completed" },
  failed: { icon: XCircle, variant: "destructive" as const, label: "Failed" },
  cancelled: { icon: XCircle, variant: "secondary" as const, label: "Cancelled" },
};

const WORKFLOW_LABELS: Record<string, string> = {
  talking_head: "Talking Head",
  broll: "B-Roll",
  full_production: "Full Production",
};

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getJobs(20)
      .then((data) => setJobs(data.jobs))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Create AI-generated videos with a single click
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/create/talking-head">
          <Card className="cursor-pointer transition-colors hover:bg-accent">
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Talking Head</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Avatar + script + voice = professional talking head video
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/create/broll">
          <Card className="cursor-pointer transition-colors hover:bg-accent">
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Film className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">B-Roll</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                AI-generated scenes stitched into cinematic B-roll
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/create/production">
          <Card className="cursor-pointer transition-colors hover:bg-accent">
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Video className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Full Production</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Complete script-to-video pipeline with talking head + B-roll
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Generations */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent Generations</h2>
          <Link href="/library">
            <Button variant="outline" size="sm">
              View All
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Wand2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium">No generations yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first video to get started
              </p>
              <Link href="/create" className="mt-4">
                <Button>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Create Video
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
              const StatusIcon = config.icon;
              return (
                <Card key={job.id}>
                  <CardContent className="flex items-center gap-4 py-4">
                    <StatusIcon
                      className={`h-5 w-5 shrink-0 ${
                        job.status === "processing" ? "animate-spin" : ""
                      } ${
                        job.status === "completed"
                          ? "text-green-500"
                          : job.status === "failed"
                          ? "text-red-500"
                          : "text-muted-foreground"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {WORKFLOW_LABELS[job.workflow] || job.workflow}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {job.step}
                      </p>
                    </div>
                    <Badge variant={config.variant}>{config.label}</Badge>
                    {job.status === "processing" && (
                      <span className="text-sm font-medium tabular-nums">
                        {job.progress}%
                      </span>
                    )}
                    {job.created_at && (
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {new Date(job.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
