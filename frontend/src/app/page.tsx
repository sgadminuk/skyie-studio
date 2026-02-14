"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Video,
  Mic,
  Film,
  Wand2,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getJobs, createJobWebSocket, type Job } from "@/lib/api";

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

function JobSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <Skeleton className="h-5 w-5 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><JobSkeleton /><JobSkeleton /><JobSkeleton /></div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const highlightJobId = searchParams.get("job");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchJobs = useCallback(() => {
    getJobs(50)
      .then((data) => setJobs(data.jobs))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  // Connect WebSocket for active jobs
  useEffect(() => {
    const activeJobs = jobs.filter(
      (j) => j.status === "queued" || j.status === "processing"
    );
    const sockets: WebSocket[] = [];

    for (const job of activeJobs) {
      try {
        const ws = createJobWebSocket(job.id);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setJobs((prev) =>
              prev.map((j) =>
                j.id === job.id
                  ? {
                      ...j,
                      status: data.status || j.status,
                      progress: data.progress ?? j.progress,
                      step: data.step || j.step,
                    }
                  : j
              )
            );
            if (data.status === "completed" || data.status === "failed") {
              ws.close();
            }
          } catch {
            // ignore parse errors
          }
        };
        ws.onerror = () => ws.close();
        sockets.push(ws);
      } catch {
        // ignore connection failures
      }
    }

    return () => sockets.forEach((ws) => ws.close());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.length]);

  const filteredJobs = jobs.filter((job) => {
    if (workflowFilter !== "all" && job.workflow !== workflowFilter) return false;
    if (statusFilter !== "all" && job.status !== statusFilter) return false;
    return true;
  });

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
        <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-xl font-semibold">Recent Generations</h2>
          <div className="flex items-center gap-2">
            <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <Filter className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Workflow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workflows</SelectItem>
                <SelectItem value="talking_head">Talking Head</SelectItem>
                <SelectItem value="broll">B-Roll</SelectItem>
                <SelectItem value="full_production">Full Production</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchJobs}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <JobSkeleton />
            <JobSkeleton />
            <JobSkeleton />
          </div>
        ) : filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Wand2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium">
                {jobs.length === 0 ? "No generations yet" : "No matching generations"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {jobs.length === 0
                  ? "Create your first video to get started"
                  : "Try adjusting your filters"}
              </p>
              {jobs.length === 0 && (
                <Link href="/create" className="mt-4">
                  <Button>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Create Video
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => {
              const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
              const StatusIcon = config.icon;
              const isHighlighted = job.id === highlightJobId;
              return (
                <Link key={job.id} href={`/jobs/${job.id}`}>
                  <Card
                    className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                      isHighlighted ? "ring-2 ring-primary" : ""
                    }`}
                  >
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
                      {job.status === "processing" && (
                        <div className="hidden sm:flex items-center gap-2 w-32">
                          <Progress value={job.progress} className="h-1.5" />
                          <span className="text-xs font-medium tabular-nums w-8">
                            {job.progress}%
                          </span>
                        </div>
                      )}
                      <Badge variant={config.variant}>{config.label}</Badge>
                      {job.created_at && (
                        <span className="hidden text-xs text-muted-foreground lg:block whitespace-nowrap">
                          {new Date(job.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
