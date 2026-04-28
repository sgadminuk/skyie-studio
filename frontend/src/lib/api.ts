import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: 60000,
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const refreshToken = localStorage.getItem("skyie_refresh_token");
      if (refreshToken) {
        try {
          const { data } = await api.post("/auth/refresh", { refresh_token: refreshToken });
          localStorage.setItem("skyie_access_token", data.access_token);
          api.defaults.headers.common["Authorization"] = `Bearer ${data.access_token}`;
          error.config.headers["Authorization"] = `Bearer ${data.access_token}`;
          return api(error.config);
        } catch {
          localStorage.removeItem("skyie_access_token");
          localStorage.removeItem("skyie_refresh_token");
          if (typeof window !== "undefined") window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

// ── Health ───────────────────────────────────────────────────────────────────

export async function getHealth() {
  const { data } = await api.get("/health");
  return data;
}

// ── Forge ────────────────────────────────────────────────────────────────────

export interface ForgeStatus {
  enabled: boolean;
  user_id: string;
  email: string;
  credits: number;
}

export async function getForgeStatus() {
  const { data } = await api.get<ForgeStatus>("/forge/status");
  return data;
}

// ── GPU Status ─────────────────────────────────────────────────────────────

export interface GpuStatus {
  online: boolean;
  gpu_url?: string;
  pod_id?: string;
  last_seen?: string;
  age_seconds?: number;
  reason?: string;
  health?: {
    status: string;
    uptime_seconds: number;
    models: {
      vram_limit_gb: number;
      vram_used_gb: number;
      vram_free_gb: number;
      loaded_models: Array<{ key: string; name: string; vram_gb: number }>;
    };
  };
}

export async function getGpuStatus(): Promise<GpuStatus> {
  const { data } = await api.get<GpuStatus>("/gpu-status");
  return data;
}

// ── Generation ──────────────────────────────────────────────────────────────

export interface TalkingHeadParams {
  script: string;
  avatar_path?: string;
  voice_engine?: string;
  voice_reference?: string | null;
  language?: string;
  generate_background?: boolean;
  background_prompt?: string;
}

export interface BrollScene {
  prompt: string;
  duration?: number;
}

export interface BrollParams {
  scenes: BrollScene[];
  style?: string;
  generate_music?: boolean;
  music_prompt?: string;
  width?: number;
  height?: number;
}

export interface FullProductionParams {
  script: string;
  avatar_path?: string;
  voice_engine?: string;
  voice_reference?: string | null;
  language?: string;
  generate_music?: boolean;
  music_prompt?: string;
  background_prompt?: string;
}

export async function generateTalkingHead(params: TalkingHeadParams) {
  const { data } = await api.post("/generate/talking-head", params);
  return data;
}

export async function generateBroll(params: BrollParams) {
  const { data } = await api.post("/generate/broll", params);
  return data;
}

export async function generateFullProduction(params: FullProductionParams) {
  const { data } = await api.post("/generate/full-production", params);
  return data;
}

// ── Phase 1: Shot Creator ──────────────────────────────────────────────────

export interface ShotsParams {
  shots: Array<{
    images: string[];
    prompts: string[];
    duration: number;
  }>;
  aspect_ratio?: string;
  transition?: string;
  remove_watermarks?: boolean;
  auto_enhance?: boolean;
  generate_music?: boolean;
  music_prompt?: string;
  width?: number;
  height?: number;
}

export async function generateShots(params: ShotsParams) {
  const { data } = await api.post("/generate/shots", params);
  return data;
}

// ── Phase 4: V2V & Extend ─────────────────────────────────────────────────

export interface V2VParams {
  source_video: string;
  prompt: string;
  strength?: number;
  style?: string;
  width?: number;
  height?: number;
}

export interface ExtendParams {
  source_video: string;
  prompt?: string;
  extend_seconds?: number;
  direction?: string;
}

export async function generateV2V(params: V2VParams) {
  const { data } = await api.post("/generate/v2v", params);
  return data;
}

export async function generateExtend(params: ExtendParams) {
  const { data } = await api.post("/generate/extend", params);
  return data;
}

// ── Phase 8: AI Director ──────────────────────────────────────────────────

export interface DirectorParams {
  idea: string;
  style?: string;
  voice_engine?: string;
  language?: string;
  template?: string;
  duration_target?: number;
}

export async function generateDirector(params: DirectorParams) {
  const { data } = await api.post("/generate/director", params);
  return data;
}

// ── Gemini (Veo 3.1 + Nano Banana) ─────────────────────────────────────────

export interface GeminiImageParams {
  prompt: string;
  reference_image_paths?: string[];
  aspect_ratio?: string;
  brand_profile_id?: string | null;
  include_logo_overlay?: boolean;
  logo_position?: string;
  logo_scale?: number;
  logo_opacity?: number;
}

export interface GeminiImageEditParams {
  prompt: string;
  source_image_path: string;
  mask_image_path?: string | null;
  brand_profile_id?: string | null;
  include_logo_overlay?: boolean;
  logo_position?: string;
  logo_scale?: number;
  logo_opacity?: number;
}

export interface GeminiVideoParams {
  prompt: string;
  source_image_path?: string | null;
  reference_image_paths?: string[] | null;
  duration_sec?: number;
  aspect_ratio?: string;
  resolution?: string;
  generate_audio?: boolean;
  negative_prompt?: string | null;
  brand_profile_id?: string | null;
}

function makeIdempotencyKey(): string {
  return (
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36))
  );
}

export async function generateGeminiImage(params: GeminiImageParams) {
  const { data } = await api.post("/generate/gemini/image", params, {
    headers: { "Idempotency-Key": makeIdempotencyKey() },
  });
  return data;
}

export async function generateGeminiImageEdit(params: GeminiImageEditParams) {
  const { data } = await api.post("/generate/gemini/image/edit", params, {
    headers: { "Idempotency-Key": makeIdempotencyKey() },
  });
  return data;
}

export async function generateGeminiVideo(params: GeminiVideoParams) {
  const { data } = await api.post("/generate/gemini/video", params, {
    headers: { "Idempotency-Key": makeIdempotencyKey() },
  });
  return data;
}

// ── Veo 3.1 prompt suggestion ─────────────────────────────────────────────

export async function suggestVeoPrompt(brief: string) {
  const { data } = await api.post<{ prompt: string; original: string }>(
    "/generate/veo/prompt-suggest",
    { brief },
  );
  return data;
}

// ── Veo 3.1 multi-shot ────────────────────────────────────────────────────

export interface MultiShotShot {
  prompt: string;
  duration_sec: number;
  reference_image_paths: string[];
  first_frame_image_path: string | null;
  negative_prompt?: string | null;
}

export interface VeoMultiShotParams {
  shots: MultiShotShot[];
  aspect_ratio: "16:9" | "9:16";
  resolution: "720p" | "1080p";
  stitch: { mode: "hard_cut" | "crossfade"; crossfade_duration_sec?: number };
  music: { enabled: boolean; prompt?: string };
  enhance_prompts: boolean;
  brand_profile_id?: string | null;
  concurrency?: number;
}

export interface MultiShotEstimate {
  shot_count: number;
  total_duration_sec: number;
  estimated_cost_usd: number;
  credits_required: number;
  user_credits: number;
  sufficient: boolean;
}

export async function estimateVeoMultiShot(params: VeoMultiShotParams) {
  const { data } = await api.post<MultiShotEstimate>(
    "/generate/veo/multi-shot/estimate",
    params,
  );
  return data;
}

export async function generateVeoMultiShot(params: VeoMultiShotParams) {
  const { data } = await api.post("/generate/veo/multi-shot", params, {
    headers: { "Idempotency-Key": makeIdempotencyKey() },
  });
  return data as { job_id: string; credits_used: number; shot_count: number };
}

// ── Avatar pack ───────────────────────────────────────────────────────────

export interface AvatarPackParams {
  reference_image_path: string;
  count?: number;
  aspect_ratio?: string;
  brief?: string;
}

export interface AvatarPackEstimate {
  count: number;
  credits_required: number;
  estimated_cost_usd: number;
  user_credits: number;
  sufficient: boolean;
}

export async function estimateAvatarPack(params: AvatarPackParams) {
  const { data } = await api.post<AvatarPackEstimate>(
    "/generate/avatar-pack/estimate",
    params,
  );
  return data;
}

export async function generateAvatarPack(params: AvatarPackParams) {
  const { data } = await api.post("/generate/avatar-pack", params, {
    headers: { "Idempotency-Key": makeIdempotencyKey() },
  });
  return data as { job_id: string; credits_used: number; count: number };
}

// ── Jobs ────────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  workflow: string;
  provider?: string;
  model?: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  step: string;
  params: Record<string, unknown>;
  created_at: string;
  started_at: string;
  completed_at: string;
  output_path: string;
  error: string;
  error_code?: string;
  cost_usd?: number | null;
  download_url?: string;
  attachment_url?: string;
}

export async function getJobs(limit = 50) {
  const { data } = await api.get<{ jobs: Job[]; count: number }>("/jobs", {
    params: { limit },
  });
  return data;
}

export async function getJob(jobId: string) {
  const { data } = await api.get<Job>(`/jobs/${jobId}`);
  return data;
}

/**
 * Force a file to actually download (not open in a new tab).
 *
 * Reasoning: cross-origin <a href download> attribute is ignored by browsers
 * even when the server returns Content-Disposition: attachment. Safari
 * specifically prefers to play mp4s inline. Fetching as a blob keeps the URL
 * same-origin (blob:) so the download attribute is honoured everywhere.
 */
export async function downloadAsBlob(url: string, filename: string) {
  const accessToken =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("skyie_access_token")
      : null;
  const res = await fetch(url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export interface RetryResult {
  job_id: string;
  workflow: string;
  status: string;
  credits_used: number;
  shots_resumed: number;
  shots_to_render: number;
}

export interface ShotOverride {
  idx: number;
  prompt?: string;
  negative_prompt?: string | null;
}

export async function retryJob(
  jobId: string,
  overrides?: ShotOverride[],
) {
  const body =
    overrides && overrides.length > 0 ? { shots_override: overrides } : undefined;
  const { data } = await api.post<RetryResult>(`/jobs/${jobId}/retry`, body, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  return data;
}

// ── Assets ──────────────────────────────────────────────────────────────────

export interface AssetItem {
  filename: string;
  path: string;
  url: string;
  size_bytes: number;
  modified: number;
  job_id?: string;
}

export interface Voice {
  id: string;
  name: string;
  language: string;
  type: "builtin" | "cloned";
}

export async function getAvatars() {
  const { data } = await api.get<{ avatars: AssetItem[] }>("/assets/avatars");
  return data.avatars;
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/assets/avatars", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
  return data;
}

export async function getVoices() {
  const { data } = await api.get<{ voices: Voice[] }>("/assets/voices");
  return data.voices;
}

export async function getVideos() {
  const { data } = await api.get<{ videos: AssetItem[] }>("/assets/videos");
  return data.videos;
}

export async function deleteVideo(jobId: string) {
  await api.delete(`/assets/videos/${jobId}`);
}

export async function getImages() {
  const { data } = await api.get<{ images: AssetItem[] }>("/assets/images");
  return data.images;
}

export async function deleteImage(jobId: string) {
  await api.delete(`/assets/images/${jobId}`);
}

// ── Export ───────────────────────────────────────────────────────────────────

export async function exportVideo(jobId: string, formats: string[]) {
  const { data } = await api.post(`/export/${jobId}`, { formats });
  return data;
}

// ── WebSocket ───────────────────────────────────────────────────────────────

export function createJobWebSocket(jobId: string): WebSocket {
  const wsUrl = API_URL.replace(/^http/, "ws");
  return new WebSocket(`${wsUrl}/api/v1/jobs/${jobId}/ws`);
}

// ── Enhance ─────────────────────────────────────────────────────────────────

export async function enhancePrompt(prompt: string, type: string = "video") {
  const { data } = await api.post("/enhance", { prompt, type });
  return data;
}

// ── Projects ────────────────────────────────────────────────────────────────

export async function getProjects() {
  const { data } = await api.get("/projects");
  return data;
}
export async function createProject(project: { name: string; workflow: string; params: Record<string, unknown> }) {
  const { data } = await api.post("/projects", project);
  return data;
}
export async function deleteProject(id: string) {
  await api.delete(`/projects/${id}`);
}

// ── Brand Kit ───────────────────────────────────────────────────────────────

export interface BrandProfile {
  id: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  website_url?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  fonts?: unknown;
  tone_of_voice?: string | null;
  target_audience?: string | null;
  industry?: string | null;
  guidelines?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandScrapeResult {
  _scrape_id: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  website_url: string;
  logo_path?: string | null;
  logo_url?: string | null;
  logo_candidates: string[];
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  tone_of_voice?: string | null;
  target_audience?: string | null;
  industry?: string | null;
  guidelines?: string | null;
}

export interface BrandProfileInput {
  name: string;
  tagline?: string | null;
  description?: string | null;
  website_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  fonts?: unknown;
  tone_of_voice?: string | null;
  target_audience?: string | null;
  industry?: string | null;
  guidelines?: string | null;
  pending_logo_path?: string | null;
}

export async function getBrandProfiles() {
  const { data } = await api.get<{ brands: BrandProfile[] }>("/brand");
  return data.brands;
}

export async function getBrandProfile(id: string) {
  const { data } = await api.get<BrandProfile>(`/brand/${id}`);
  return data;
}

export async function createBrandProfile(payload: BrandProfileInput) {
  const { data } = await api.post<BrandProfile>("/brand", payload);
  return data;
}

export async function updateBrandProfile(id: string, payload: BrandProfileInput) {
  const { data } = await api.put<BrandProfile>(`/brand/${id}`, payload);
  return data;
}

export async function deleteBrandProfile(id: string) {
  await api.delete(`/brand/${id}`);
}

export async function scrapeBrandFromUrl(url: string) {
  const { data } = await api.post<BrandScrapeResult>("/brand/scrape", { url }, { timeout: 30000 });
  return data;
}

export async function uploadBrandLogo(id: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<BrandProfile>(`/brand/${id}/logo`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
  return data;
}

export async function uploadScrapeLogo(scrapeId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  form.append("scrape_id", scrapeId);
  const { data } = await api.post<{ pending_logo_path: string; logo_url: string }>(
    "/brand/scrape/logo",
    form,
    { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 },
  );
  return data;
}

export async function selectScrapeLogoCandidate(scrapeId: string, candidateUrl: string) {
  const { data } = await api.post<{ pending_logo_path: string; logo_url: string }>(
    "/brand/scrape/select-logo",
    { scrape_id: scrapeId, candidate_url: candidateUrl },
    { timeout: 30000 },
  );
  return data;
}

// ── Billing ─────────────────────────────────────────────────────────────────

export async function getCreditCosts() {
  const { data } = await api.get("/billing/credit-costs");
  return data;
}
export async function getPackages() {
  const { data } = await api.get("/billing/packages");
  return data;
}
export async function purchaseCredits(packageId: string) {
  const { data } = await api.post("/billing/purchase", { package_id: packageId });
  return data;
}
export async function getCreditHistory() {
  const { data } = await api.get("/billing/history");
  return data;
}

export default api;
