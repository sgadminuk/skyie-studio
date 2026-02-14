"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createJobWebSocket, type Job } from "@/lib/api";

interface JobProgress {
  id: string;
  status: Job["status"];
  progress: number;
  step: string;
  error?: string;
  output_path?: string;
  download_url?: string;
  elapsed: number;
}

export function useJobProgress(jobId: string | null) {
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const reconnectAttemptsRef = useRef(0);
  const maxReconnects = 5;

  const connect = useCallback(() => {
    if (!jobId) return;

    try {
      const ws = createJobWebSocket(jobId);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setProgress((prev) => ({
            id: jobId,
            status: data.status || prev?.status || "queued",
            progress: data.progress ?? prev?.progress ?? 0,
            step: data.step || prev?.step || "Queued",
            error: data.error || prev?.error,
            output_path: data.output_path || prev?.output_path,
            download_url: data.download_url || prev?.download_url,
            elapsed: (Date.now() - startTimeRef.current) / 1000,
          }));

          if (data.status === "completed" || data.status === "failed") {
            ws.close();
            if (timerRef.current) clearInterval(timerRef.current);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (
          reconnectAttemptsRef.current < maxReconnects &&
          progress?.status !== "completed" &&
          progress?.status !== "failed"
        ) {
          const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 10000);
          reconnectAttemptsRef.current++;
          setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // WebSocket creation failed
    }
  }, [jobId, progress?.status]);

  useEffect(() => {
    if (!jobId) return;

    startTimeRef.current = Date.now();
    setProgress({
      id: jobId,
      status: "queued",
      progress: 0,
      step: "Connecting...",
      elapsed: 0,
    });

    connect();

    timerRef.current = setInterval(() => {
      setProgress((prev) =>
        prev
          ? { ...prev, elapsed: (Date.now() - startTimeRef.current) / 1000 }
          : null
      );
    }, 1000);

    return () => {
      wsRef.current?.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [jobId, connect]);

  return progress;
}

export function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
