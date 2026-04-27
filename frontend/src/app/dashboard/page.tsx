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
  RefreshCw,
  Cpu,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { getJobs, getGpuStatus, createJobWebSocket, type Job, type GpuStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  queued:     { icon: Clock,        label: "Queued",     variant: "secondary" as const },
  processing: { icon: Loader2,      label: "Processing", variant: "default" as const   },
  completed:  { icon: CheckCircle2, label: "Completed",  variant: "outline" as const   },
  failed:     { icon: XCircle,      label: "Failed",     variant: "destructive" as const },
  cancelled:  { icon: XCircle,      label: "Cancelled",  variant: "secondary" as const },
};

const WORKFLOW_LABELS: Record<string, string> = {
  talking_head: "Talking Head",
  broll: "B-Roll",
  full_production: "Full Production",
  shots: "Shot Creator",
  v2v: "Video Transform",
  extend: "Video Extend",
  director: "AI Director",
};

const QUICK_ACTIONS = [
  {
    href: "/create/talking-head",
    title: "Talking Head",
    icon: Mic,
    desc: "Avatar + script + voice = professional talking head video.",
    idx: "01",
  },
  {
    href: "/create/broll",
    title: "B-Roll",
    icon: Film,
    desc: "AI-generated scenes stitched into cinematic B-roll.",
    idx: "02",
  },
  {
    href: "/create/production",
    title: "Full Production",
    icon: Video,
    desc: "Script-to-video pipeline with talking head + B-roll.",
    idx: "03",
  },
];

function JobSkeleton() {
  return (
    <div className="border border-ink/15 px-5 py-4 flex items-center gap-4">
      <Skeleton className="h-5 w-5" />
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-5 w-16" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3">
          <JobSkeleton /><JobSkeleton /><JobSkeleton />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const highlightJobId = searchParams.get("job");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [gpuStatus, setGpuStatus] = useState<GpuStatus | null>(null);
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchJobs = useCallback(() => {
    getJobs(50)
      .then((data) => setJobs(data.jobs))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fetchGpuStatus = useCallback(() => {
    getGpuStatus()
      .then(setGpuStatus)
      .catch(() => setGpuStatus(null));
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchGpuStatus();
    const jobInterval = setInterval(fetchJobs, 10000);
    const gpuInterval = setInterval(fetchGpuStatus, 30000);
    return () => {
      clearInterval(jobInterval);
      clearInterval(gpuInterval);
    };
  }, [fetchJobs, fetchGpuStatus]);

  // WebSocket for active job progress
  useEffect(() => {
    const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "processing");
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
                  : j,
              ),
            );
            if (data.status === "completed" || data.status === "failed") ws.close();
          } catch {}
        };
        ws.onerror = () => ws.close();
        sockets.push(ws);
      } catch {}
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
    <div className="flex flex-col gap-[clamp(32px,5vh,64px)]">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <span className="text-mono-sm text-ink/40">DASHBOARD · §00</span>
        <h1 className="text-h2 text-ink">Recent generations.</h1>
        <p className="text-ink/60 max-w-[60ch]">
          Live queue and rendered output. Click any job for the full record.
        </p>
      </header>

      {/* GPU status — instrument-style ledger */}
      <section
        aria-labelledby="gpu-heading"
        className="border border-ink/15 px-5 py-4 flex items-center gap-6 flex-wrap"
      >
        <h2 id="gpu-heading" className="sr-only">GPU status</h2>
        <div className="flex items-center gap-3">
          <Cpu className={cn("h-4 w-4", gpuStatus?.online ? "text-ink" : "text-destructive")} />
          <span className="text-mono-sm text-ink/40">GPU</span>
          <span
            className={cn(
              "h-2 w-2 shrink-0",
              gpuStatus?.online ? "bg-signal animate-pulse" : "bg-destructive",
            )}
            aria-hidden
          />
          <span className="text-mono-sm tracking-[0.18em] uppercase text-ink">
            {gpuStatus?.online ? "Online" : "Offline"}
          </span>
        </div>

        {gpuStatus?.online && gpuStatus.health?.models && (
          <Ledger label="VRAM">
            {gpuStatus.health.models.vram_free_gb}GB free
          </Ledger>
        )}
        {!gpuStatus?.online && (
          <Ledger label="Reason">
            {gpuStatus?.reason === "heartbeat_expired" ? "Lost connection" : "No GPU connected"}
          </Ledger>
        )}
        {gpuStatus?.online && gpuStatus.pod_id && (
          <Ledger label="Pod">{gpuStatus.pod_id.slice(0, 12)}</Ledger>
        )}
      </section>

      {/* Quick actions */}
      <section aria-labelledby="actions-heading" className="flex flex-col gap-4">
        <header className="flex items-baseline gap-3">
          <span className="text-mono-sm text-ink/40">§01</span>
          <h2 id="actions-heading" className="text-h3 text-ink">Workflows.</h2>
        </header>
        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3 bg-ink/15">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group bg-paper p-6 flex flex-col gap-4 transition-colors hover:bg-ink/5"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-mono-sm text-ink/40">{a.idx}</span>
                <a.icon className="h-5 w-5 text-ink/55 group-hover:text-signal transition-colors" />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-h3 text-ink">{a.title}</span>
                <span className="text-sm text-ink/65 leading-relaxed">{a.desc}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent generations */}
      <section aria-labelledby="recent-heading" className="flex flex-col gap-4">
        <header className="flex items-baseline justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3">
            <span className="text-mono-sm text-ink/40">§02</span>
            <h2 id="recent-heading" className="text-h3 text-ink">Queue.</h2>
            <span className="text-mono-sm text-ink/40">
              {String(filteredJobs.length).padStart(3, "0")} / {String(jobs.length).padStart(3, "0")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
              <SelectTrigger className="h-8 w-[140px] text-mono-sm">
                <SelectValue placeholder="Workflow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workflows</SelectItem>
                <SelectItem value="talking_head">Talking Head</SelectItem>
                <SelectItem value="broll">B-Roll</SelectItem>
                <SelectItem value="full_production">Full Production</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[130px] text-mono-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={fetchJobs}
              aria-label="Refresh"
              className="flex h-8 w-8 items-center justify-center text-ink/55 transition-colors hover:text-ink border border-ink/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col gap-2">
            <JobSkeleton /><JobSkeleton /><JobSkeleton />
          </div>
        ) : filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <Wand2 className="h-10 w-10 text-ink/30" />
              <span className="text-h3 text-ink">
                {jobs.length === 0 ? "No generations yet." : "No matching generations."}
              </span>
              <span className="text-sm text-ink/55">
                {jobs.length === 0
                  ? "Create your first video to get started."
                  : "Try adjusting your filters."}
              </span>
              {jobs.length === 0 && (
                <Link
                  href="/dashboard/create"
                  className="text-mono-sm tracking-[0.18em] uppercase border border-ink px-4 py-2 mt-2 hover:bg-ink hover:text-paper transition-colors"
                >
                  Create video
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredJobs.map((job) => {
              const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
              const StatusIcon = config.icon;
              const isHighlighted = job.id === highlightJobId;
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className={cn(
                    "border border-ink/15 px-5 py-4 flex items-center gap-4 transition-colors hover:border-ink/40",
                    isHighlighted && "border-signal",
                  )}
                >
                  <StatusIcon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      job.status === "processing" && "animate-spin text-signal",
                      job.status === "completed" && "text-ink",
                      job.status === "failed" && "text-destructive",
                      (job.status === "queued" || job.status === "cancelled") && "text-ink/40",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate">
                      {WORKFLOW_LABELS[job.workflow] || job.workflow}
                    </p>
                    <p className="text-mono-sm text-ink/55 truncate mt-0.5">{job.step}</p>
                  </div>
                  {job.status === "processing" && (
                    <div className="hidden sm:flex items-center gap-2 w-32">
                      <Progress value={job.progress} className="h-[2px]" />
                      <span className="text-mono-sm tabular-nums w-8 text-right text-ink/65">
                        {job.progress}%
                      </span>
                    </div>
                  )}
                  <Badge variant={config.variant}>{config.label}</Badge>
                  {job.created_at && (
                    <span className="hidden lg:block text-mono-sm text-ink/40 whitespace-nowrap">
                      {new Date(job.created_at).toLocaleDateString()}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Ledger({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-mono-sm text-ink/40">{label}</span>
      <span className="text-mono-sm text-ink">{children}</span>
    </div>
  );
}
