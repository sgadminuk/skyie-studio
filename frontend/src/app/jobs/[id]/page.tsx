"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Share2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { getJob, exportVideo, type Job } from "@/lib/api";
import { useJobProgress, formatElapsed } from "@/hooks/use-job-progress";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const WORKFLOW_LABELS: Record<string, string> = {
  talking_head: "Talking Head",
  broll: "B-Roll",
  full_production: "Full Production",
};

const STATUS_CONFIG = {
  queued: { icon: Clock, color: "text-muted-foreground", label: "Queued" },
  processing: { icon: Loader2, color: "text-blue-500", label: "Processing" },
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-500", label: "Failed" },
  cancelled: { icon: XCircle, color: "text-muted-foreground", label: "Cancelled" },
};

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const isActive =
    job?.status === "queued" || job?.status === "processing";
  const progress = useJobProgress(isActive ? jobId : null);

  useEffect(() => {
    getJob(jobId)
      .then((data) => setJob(data))
      .catch(() => toast.error("Failed to load job details"))
      .finally(() => setLoading(false));
  }, [jobId]);

  // Update job from WebSocket progress
  useEffect(() => {
    if (progress && progress.status) {
      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: progress.status,
              progress: progress.progress,
              step: progress.step,
              error: progress.error || prev.error,
              output_path: progress.output_path || prev.output_path,
              download_url: progress.download_url || prev.download_url,
            }
          : prev
      );
    }
  }, [progress]);

  async function handleExport(formats: string[]) {
    setExporting(true);
    try {
      await exportVideo(jobId, formats);
      toast.success("Export started");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <p className="text-muted-foreground">Job not found.</p>
      </div>
    );
  }

  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
  const StatusIcon = config.icon;
  const downloadUrl = job.download_url
    ? `${API_URL}${job.download_url}`
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {WORKFLOW_LABELS[job.workflow] || job.workflow}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(job.created_at).toLocaleString()}
          </p>
        </div>
        <Badge
          variant={
            job.status === "completed"
              ? "default"
              : job.status === "failed"
              ? "destructive"
              : "secondary"
          }
        >
          <StatusIcon
            className={`mr-1 h-3 w-3 ${
              job.status === "processing" ? "animate-spin" : ""
            }`}
          />
          {config.label}
        </Badge>
      </div>

      {/* Progress */}
      {(job.status === "processing" || job.status === "queued") && (
        <Card>
          <CardContent className="py-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{job.step}</span>
              <span className="tabular-nums text-muted-foreground">
                {job.progress}%
              </span>
            </div>
            <Progress value={job.progress} className="h-2" />
            {progress && (
              <p className="text-xs text-muted-foreground">
                Elapsed: {formatElapsed(progress.elapsed)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Video Player */}
      {job.status === "completed" && downloadUrl && (
        <Card className="overflow-hidden">
          <div className="aspect-video bg-black flex items-center justify-center">
            <video
              src={downloadUrl}
              controls
              className="w-full h-full"
              poster=""
            >
              <track kind="captions" />
            </video>
          </div>
          <CardContent className="py-4">
            <div className="flex gap-2 flex-wrap">
              <Button asChild>
                <a href={downloadUrl} download>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
              <Button
                variant="outline"
                disabled={exporting}
                onClick={() =>
                  handleExport(["tiktok", "youtube", "instagram"])
                }
              >
                <Share2 className="mr-2 h-4 w-4" />
                {exporting ? "Exporting..." : "Export All Formats"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {job.status === "failed" && job.error && (
        <Card className="border-destructive/50">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-destructive">Error</p>
            <p className="text-sm text-muted-foreground mt-1">{job.error}</p>
          </CardContent>
        </Card>
      )}

      {/* Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(job.params || {}).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-4">
                <span className="text-sm text-muted-foreground shrink-0">
                  {key.replace(/_/g, " ")}
                </span>
                <span className="text-sm text-right truncate max-w-[60%]">
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Created</span>
              <span>
                {job.created_at
                  ? new Date(job.created_at).toLocaleString()
                  : "—"}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Started</span>
              <span>
                {job.started_at
                  ? new Date(job.started_at).toLocaleString()
                  : "—"}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Completed</span>
              <span>
                {job.completed_at
                  ? new Date(job.completed_at).toLocaleString()
                  : "—"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
