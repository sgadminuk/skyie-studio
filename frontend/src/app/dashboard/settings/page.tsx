"use client";

import { useEffect, useState } from "react";
import { Server, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getHealth } from "@/lib/api";

interface HealthData {
  status: string;
  environment: string;
  mock_mode: boolean;
  gpu: Record<string, unknown>;
  models: {
    loaded_models: string[];
    vram_used_gb: number;
    vram_limit_gb: number;
    mock_mode: boolean;
  };
  disk: { total_gb: number; used_gb: number; free_gb: number };
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-[clamp(32px,5vh,64px)]">
      <header className="flex flex-col gap-3">
        <span className="text-mono-sm text-ink/40">SETTINGS · §00</span>
        <h1 className="text-h2 text-ink">System status.</h1>
        <p className="text-ink/60 max-w-[60ch]">
          Read-only telemetry. The studio reports its own state — no
          configuration knobs here yet.
        </p>
      </header>

      {/* Server status */}
      <section aria-labelledby="server-heading" className="flex flex-col gap-4">
        <header className="flex items-baseline gap-3">
          <span className="text-mono-sm text-ink/40">§01</span>
          <h2 id="server-heading" className="text-h3 text-ink flex items-baseline gap-2">
            <Server className="h-4 w-4 text-ink/55 self-center" />
            Server.
          </h2>
        </header>

        <div className="border border-ink/15">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-ink/55" />
            </div>
          ) : health ? (
            <div className="divide-y divide-ink/15">
              <Row label="Status">
                <Badge variant={health.status === "healthy" ? "default" : "destructive"}>
                  {health.status}
                </Badge>
              </Row>
              <Row label="Environment">{health.environment}</Row>
              <Row label="Mock mode">
                <Badge variant={health.mock_mode ? "secondary" : "outline"}>
                  {health.mock_mode ? "Enabled" : "Disabled"}
                </Badge>
              </Row>
              <Row label="Disk">
                {health.disk.used_gb} / {health.disk.total_gb} GB
              </Row>
              {health.models && (
                <>
                  <Row label="VRAM">
                    {health.models.vram_used_gb} / {health.models.vram_limit_gb} GB
                  </Row>
                  <Row label="Loaded models">
                    {health.models.loaded_models.length === 0
                      ? "None"
                      : health.models.loaded_models.join(", ")}
                  </Row>
                </>
              )}
            </div>
          ) : (
            <p className="px-5 py-6 text-mono-sm text-destructive">
              Unable to connect to the API server.
            </p>
          )}
        </div>
      </section>

      {/* Account placeholder */}
      <section aria-labelledby="account-heading" className="flex flex-col gap-4">
        <header className="flex items-baseline gap-3">
          <span className="text-mono-sm text-ink/40">§02</span>
          <h2 id="account-heading" className="text-h3 text-ink">Account.</h2>
        </header>
        <div className="border border-ink/15 px-5 py-6">
          <p className="text-mono-sm text-ink/60">
            User accounts and authentication will be available in a future update.
          </p>
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-4 px-5 py-4 items-baseline">
      <span className="text-mono-sm text-ink/40">{label}</span>
      <span className="text-mono-sm text-ink truncate">{children}</span>
    </div>
  );
}
