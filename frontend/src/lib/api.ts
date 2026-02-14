import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

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

export default api;
