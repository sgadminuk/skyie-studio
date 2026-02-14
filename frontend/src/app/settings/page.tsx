"use client";

import { useEffect, useState } from "react";
import { Settings, Server, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          System status and configuration
        </p>
      </div>

      {/* Server Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            Server Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : health ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Status</span>
                <Badge
                  variant={
                    health.status === "healthy" ? "default" : "destructive"
                  }
                >
                  {health.status}
                </Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm">Environment</span>
                <span className="text-sm text-muted-foreground">
                  {health.environment}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Mock Mode</span>
                <Badge variant={health.mock_mode ? "secondary" : "default"}>
                  {health.mock_mode ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm">Disk Usage</span>
                <span className="text-sm text-muted-foreground">
                  {health.disk.used_gb} / {health.disk.total_gb} GB
                </span>
              </div>
              {health.models && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">VRAM Usage</span>
                    <span className="text-sm text-muted-foreground">
                      {health.models.vram_used_gb} / {health.models.vram_limit_gb} GB
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Loaded Models</span>
                    <span className="text-sm text-muted-foreground">
                      {health.models.loaded_models.length === 0
                        ? "None"
                        : health.models.loaded_models.join(", ")}
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-destructive">
              Unable to connect to the API server
            </p>
          )}
        </CardContent>
      </Card>

      {/* Account (Phase 5 placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            User accounts and authentication will be available in a future
            update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
