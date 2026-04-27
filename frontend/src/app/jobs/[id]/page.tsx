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
  RotateCcw,
  FileArchive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  getJob,
  exportVideo,
  retryJob,
  downloadAsBlob,
  type Job,
  type ShotOverride,
} from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import { useJobProgress, formatElapsed } from "@/hooks/use-job-progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const WORKFLOW_LABELS: Record<string, string> = {
  talking_head: "Talking Head",
  broll: "B-Roll",
  full_production: "Full Production",
  shots: "Shot Creator",
  v2v: "Video Transform",
  extend: "Video Extend",
  director: "AI Director",
  gemini_image: "Gemini Image",
  gemini_image_edit: "Gemini Image Edit",
  gemini_video: "Veo 3.1 Video",
  veo_multi_shot: "Veo 3.1 Multi-Shot",
  avatar_pack: "AI Avatar Pack",
};

const IMAGE_WORKFLOWS = new Set(["gemini_image", "gemini_image_edit"]);

const ERROR_CODE_MESSAGES: Record<string, { title: string; hint: string }> = {
  gemini_safety: {
    title: "Blocked by safety filter",
    hint: "Gemini declined this prompt or the output tripped a safety rule. Try rephrasing more concretely and avoiding sensitive content.",
  },
  gemini_quota: {
    title: "Provider quota exceeded",
    hint: "Daily or monthly Gemini quota reached. Retry tomorrow or request a quota increase.",
  },
  gemini_rate_limit: {
    title: "Rate limit hit",
    hint: "You've submitted too many requests in a short window. Wait a minute and try again.",
  },
  gemini_degraded: {
    title: "Provider temporarily degraded",
    hint: "Gemini is returning errors. The circuit breaker will reset automatically — retry in ~2 minutes.",
  },
  gemini_invalid_input: {
    title: "Invalid input",
    hint: "Gemini rejected the request. Check the prompt, image, and aspect ratio.",
  },
  gemini_transient: {
    title: "Temporary error",
    hint: "Transient provider issue. Retry the job.",
  },
};

const STATUS_CONFIG = {
  queued:     { icon: Clock,        label: "Queued",     tint: "text-ink/55"      },
  processing: { icon: Loader2,      label: "Processing", tint: "text-signal"      },
  completed:  { icon: CheckCircle2, label: "Completed",  tint: "text-ink"         },
  failed:     { icon: XCircle,      label: "Failed",     tint: "text-destructive" },
  cancelled:  { icon: XCircle,      label: "Cancelled",  tint: "text-ink/40"      },
};

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryEdits, setRetryEdits] = useState<Record<number, string>>({});

  const isActive = job?.status === "queued" || job?.status === "processing";
  const progress = useJobProgress(isActive ? jobId : null);

  useEffect(() => {
    getJob(jobId)
      .then((data) => setJob(data))
      .catch(() => toast.error("Failed to load job details"))
      .finally(() => setLoading(false));
  }, [jobId]);

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
          : prev,
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

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    try {
      const shots = ((job?.params as Record<string, unknown>)?.shots ?? []) as Array<{
        prompt?: string;
      }>;
      const overrides: ShotOverride[] = Object.entries(retryEdits)
        .map(([k, v]) => ({ idx: Number(k), prompt: v.trim() }))
        .filter((o) => o.prompt && o.prompt !== (shots[o.idx]?.prompt ?? "").trim());

      const result = await retryJob(jobId, overrides.length ? overrides : undefined);
      toast.success(
        `Retrying ${result.shots_to_render} shot${result.shots_to_render === 1 ? "" : "s"} ` +
          `(${result.shots_resumed} reused). ${result.credits_used} credits.`,
      );
      router.push(`/jobs/${result.job_id}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Retry failed";
      toast.error(detail);
      setRetrying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-ink/55" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <p className="text-mono-sm text-ink/55">Job not found.</p>
      </div>
    );
  }

  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
  const StatusIcon = config.icon;
  const downloadUrl = job.download_url ? `${API_URL}${job.download_url}` : null;
  const attachmentUrl = job.attachment_url ? `${API_URL}${job.attachment_url}` : downloadUrl;
  const aspectClass = (() => {
    const ar = (job.params as Record<string, unknown>)?.aspect_ratio;
    if (ar === "9:16") return "aspect-[9/16] max-w-sm";
    if (ar === "1:1") return "aspect-square max-w-xl";
    return "aspect-video";
  })();

  return (
    <div className="mx-auto w-full max-w-4xl flex flex-col gap-[clamp(24px,4vh,48px)]">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-mono-sm text-ink/55 hover:text-ink flex items-center gap-2 transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          BACK
        </button>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="flex flex-col gap-2">
            <span className="text-mono-sm text-ink/40">
              JOB · {jobId.slice(0, 8).toUpperCase()}
            </span>
            <h1 className="text-h2 text-ink">
              {WORKFLOW_LABELS[job.workflow] || job.workflow}.
            </h1>
            <p className="text-mono-sm text-ink/55">
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
              className={cn("h-3 w-3 mr-1", job.status === "processing" && "animate-spin")}
            />
            {config.label}
          </Badge>
        </div>
      </header>

      {/* Progress (active states) */}
      {(job.status === "processing" || job.status === "queued") && (
        <section className="border border-ink/15 px-6 py-5 flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-ink">{job.step}</span>
            <span className="text-mono-sm tabular-nums text-ink/55">{job.progress}%</span>
          </div>
          <Progress value={job.progress} />
          {progress && (
            <p className="text-mono-sm text-ink/55">Elapsed · {formatElapsed(progress.elapsed)}</p>
          )}
        </section>
      )}

      {/* Avatar pack gallery */}
      {job.workflow === "avatar_pack" && (() => {
        const scenes = ((job.params as Record<string, unknown>)?.scenes ?? []) as Array<{
          label?: string;
          prompt?: string;
        }>;
        const status = ((job.params as Record<string, unknown>)?.scenes_status ?? []) as Array<{
          status?: string;
          image_path?: string;
          error?: string;
        }>;
        if (!scenes.length && !status.length) return null;
        const tiles = scenes.length
          ? scenes
          : status.map(() => ({} as { label?: string; prompt?: string }));
        const completedCount = status.filter((s) => s.status === "completed").length;
        const handleDownloadAll = () => {
          downloadAsBlob(
            `${API_URL}/api/v1/jobs/${jobId}/download-all`,
            `avatar-pack-${jobId.slice(0, 8)}.zip`,
          ).catch(() => toast.error("ZIP download failed"));
        };
        const handleDownloadOne = (idx: number, ext: string) => {
          downloadAsBlob(
            `${API_URL}/api/v1/jobs/${jobId}/download/${idx}`,
            `avatar-${jobId.slice(0, 8)}-${String(idx + 1).padStart(2, "0")}.${ext}`,
          ).catch(() => toast.error("Download failed"));
        };
        return (
          <section className="flex flex-col gap-4">
            <header className="flex items-baseline justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-3">
                <span className="text-mono-sm text-ink/40">§01</span>
                <h2 className="text-h3 text-ink">Avatars.</h2>
                <span className="text-mono-sm text-ink/55">
                  {String(completedCount).padStart(2, "0")} / {String(tiles.length).padStart(2, "0")}
                  {job.status === "processing" && " · streaming"}
                </span>
              </div>
              {completedCount > 0 && (
                <Button size="sm" variant="outline" onClick={handleDownloadAll}>
                  <FileArchive className="h-4 w-4" />
                  Download all
                </Button>
              )}
            </header>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-[1px] bg-ink/15">
              {tiles.map((scene, i) => {
                const s = status[i] || {};
                const imgUrl = s.image_path
                  ? `${API_URL}${s.image_path.replace(/^\/app/, "")}`
                  : null;
                const ext = (s.image_path || "").endsWith(".jpg") ? "jpg" : "png";
                return (
                  <div
                    key={i}
                    className="relative group aspect-square overflow-hidden bg-ink/[0.06]"
                  >
                    {imgUrl ? (
                      <>
                        <img
                          src={imgUrl}
                          alt={scene.label || `Avatar ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleDownloadOne(i, ext)}
                          aria-label={`Download avatar ${i + 1}`}
                          className="absolute top-2 right-2 bg-ink text-paper p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-ink/55">
                        {s.status === "failed" ? (
                          <XCircle className="h-6 w-6 text-destructive" />
                        ) : s.status === "processing" ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          <Clock className="h-5 w-5 opacity-50" />
                        )}
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 px-2 py-1 text-mono-sm bg-ink text-paper truncate pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                      {scene.label || `Avatar ${i + 1}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* Output viewer */}
      {job.status === "completed" && downloadUrl && job.workflow !== "avatar_pack" && (
        <section className="flex flex-col gap-4">
          <header className="flex items-baseline gap-3">
            <span className="text-mono-sm text-ink/40">§01</span>
            <h2 className="text-h3 text-ink">Output.</h2>
          </header>
          <div className="border border-ink/15">
            {IMAGE_WORKFLOWS.has(job.workflow) ? (
              <div className="bg-ink flex items-center justify-center">
                <img src={downloadUrl} alt="Generated output" className="max-h-[70vh] w-auto" />
              </div>
            ) : (
              <div className={cn("bg-ink flex items-center justify-center mx-auto max-h-[80vh]", aspectClass)}>
                <video
                  src={attachmentUrl ?? downloadUrl}
                  controls
                  className="w-full h-full"
                  poster=""
                >
                  <track kind="captions" />
                </video>
              </div>
            )}
            <div className="border-t border-ink/15 px-5 py-4 flex gap-2 flex-wrap items-center">
              <Button
                onClick={() => {
                  if (!attachmentUrl && !downloadUrl) return;
                  const url = (attachmentUrl ?? downloadUrl) as string;
                  const ext = (job.output_path || "output.bin").split(".").pop();
                  const filename = `${job.workflow}-${jobId.slice(0, 8)}.${ext}`;
                  downloadAsBlob(url, filename).catch(() => toast.error("Download failed"));
                }}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              {!IMAGE_WORKFLOWS.has(job.workflow) && (
                <Button
                  variant="outline"
                  disabled={exporting}
                  onClick={() => handleExport(["tiktok", "youtube", "instagram"])}
                >
                  <Share2 className="h-4 w-4" />
                  {exporting ? "Exporting…" : "Export all formats"}
                </Button>
              )}
              {(() => {
                const cost = job.cost_usd == null ? null : Number(job.cost_usd);
                if (cost == null || Number.isNaN(cost)) return null;
                return (
                  <span className="ml-auto text-mono-sm text-ink/55 tabular-nums">
                    Provider cost · ${cost.toFixed(4)}
                  </span>
                );
              })()}
            </div>
          </div>
        </section>
      )}

      {/* Error */}
      {job.status === "failed" && job.error && (
        <section className="flex flex-col gap-4">
          <header className="flex items-baseline gap-3">
            <span className="text-mono-sm text-destructive">ERR</span>
            <h2 className="text-h3 text-destructive">Failure.</h2>
          </header>
          <div className="border border-destructive/40 bg-destructive/[0.04] px-6 py-5 flex flex-col gap-3">
            {job.error_code && ERROR_CODE_MESSAGES[job.error_code] ? (
              <>
                <p className="text-sm text-destructive">{ERROR_CODE_MESSAGES[job.error_code].title}</p>
                <p className="text-sm text-ink/70">{ERROR_CODE_MESSAGES[job.error_code].hint}</p>
                <p className="text-mono-sm text-ink/45">{job.error}</p>
              </>
            ) : (
              <>
                <p className="text-sm text-destructive">Error</p>
                <p className="text-sm text-ink/70">{job.error}</p>
              </>
            )}
            {job.workflow === "veo_multi_shot" && (() => {
              const shotsList = ((job.params as Record<string, unknown>)?.shots ?? []) as Array<{
                prompt?: string;
              }>;
              const shotsStatus = ((job.params as Record<string, unknown>)?.shots_status ??
                []) as Array<{ status?: string; error?: string }>;
              const incompleteIdxs = shotsList
                .map((_, i) => i)
                .filter((i) => shotsStatus[i]?.status !== "completed");
              return (
                <div className="pt-2 flex flex-col gap-3">
                  {incompleteIdxs.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <p className="text-mono-sm text-ink/55">
                        EDIT PROMPTS BEFORE RETRYING (optional)
                      </p>
                      {incompleteIdxs.map((idx) => {
                        const original = shotsList[idx]?.prompt ?? "";
                        const status = shotsStatus[idx];
                        return (
                          <div key={idx} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-mono-sm text-ink">SHOT {idx + 1}</span>
                              <Badge variant="outline">{status?.status ?? "queued"}</Badge>
                            </div>
                            {status?.error && (
                              <p className="text-mono-sm text-destructive/80">{status.error}</p>
                            )}
                            <Textarea
                              value={retryEdits[idx] ?? original}
                              onChange={(e) =>
                                setRetryEdits((prev) => ({
                                  ...prev,
                                  [idx]: e.target.value,
                                }))
                              }
                              rows={3}
                              placeholder="Shot prompt"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Button size="sm" variant="outline" disabled={retrying} onClick={handleRetry}>
                    <RotateCcw className={cn("h-4 w-4", retrying && "animate-spin")} />
                    {retrying ? "Retrying…" : "Retry failed shots"}
                  </Button>
                  <p className="text-mono-sm text-ink/55">
                    Successful clips are reused — credits charged only for shots that re-render.
                  </p>
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* Parameters */}
      <section className="flex flex-col gap-4">
        <header className="flex items-baseline gap-3">
          <span className="text-mono-sm text-ink/40">§02</span>
          <h2 className="text-h3 text-ink">Parameters.</h2>
        </header>
        <div className="border border-ink/15 divide-y divide-ink/15">
          {Object.entries(job.params || {}).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[14rem_1fr] gap-4 px-5 py-3 items-baseline">
              <span className="text-mono-sm text-ink/40 truncate">
                {key.replace(/_/g, " ").toUpperCase()}
              </span>
              <span className="text-sm text-ink/85 truncate">
                {typeof value === "object" ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section className="flex flex-col gap-4">
        <header className="flex items-baseline gap-3">
          <span className="text-mono-sm text-ink/40">§03</span>
          <h2 className="text-h3 text-ink">Timeline.</h2>
        </header>
        <div className="border border-ink/15 divide-y divide-ink/15">
          {[
            { label: "Created", value: job.created_at },
            { label: "Started", value: job.started_at },
            { label: "Completed", value: job.completed_at },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="grid grid-cols-[14rem_1fr] gap-4 px-5 py-3 items-baseline"
            >
              <span className="text-mono-sm text-ink/40">{label.toUpperCase()}</span>
              <span className="text-mono-sm text-ink/85">
                {value ? new Date(value).toLocaleString() : "—"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
