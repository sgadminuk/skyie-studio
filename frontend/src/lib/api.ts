import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
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

// ── Jobs ────────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  workflow: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  step: string;
  params: Record<string, unknown>;
  created_at: string;
  started_at: string;
  completed_at: string;
  output_path: string;
  error: string;
  download_url?: string;
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

// ── Assets ──────────────────────────────────────────────────────────────────

export interface AssetItem {
  filename: string;
  path: string;
  url: string;
  size_bytes: number;
  modified: number;
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
