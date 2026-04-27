"use client";

import { useEffect, useState } from "react";
import { Users, Cpu, Clock, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface AdminStats {
  total_users: number;
  total_jobs: number;
  gpu_hours: number;
  active_jobs: number;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  plan: string;
  credits: number;
  is_admin: boolean;
  created_at: string;
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/users"),
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data.users || usersRes.data || []);
    } catch {
      // handle error silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="flex flex-col gap-[clamp(32px,5vh,64px)]">
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div className="flex flex-col gap-2">
          <span className="text-mono-sm text-ink/40">ADMIN · §00 · SHIELD ACCESS</span>
          <h1 className="text-h2 text-ink">Platform overview.</h1>
          <p className="text-ink/60 max-w-[60ch]">
            Aggregate counters and the user roster. All operations are read-only here today.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </header>

      {/* Stats grid */}
      <section aria-labelledby="stats-heading" className="flex flex-col gap-4">
        <header className="flex items-baseline gap-3">
          <span className="text-mono-sm text-ink/40">§01</span>
          <h2 id="stats-heading" className="text-h3 text-ink">Counters.</h2>
        </header>
        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4 bg-ink/15">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-paper p-6 flex flex-col gap-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-24" />
              </div>
            ))
          ) : stats ? (
            <>
              <Stat icon={Users} label="Total users" value={stats.total_users} />
              <Stat icon={Cpu} label="Total jobs" value={stats.total_jobs} />
              <Stat icon={Clock} label="GPU hours" value={stats.gpu_hours.toFixed(1)} />
              <Stat icon={Loader2} label="Active jobs" value={stats.active_jobs} />
            </>
          ) : null}
        </div>
      </section>

      {/* Users table */}
      <section aria-labelledby="users-heading" className="flex flex-col gap-4">
        <header className="flex items-baseline gap-3">
          <span className="text-mono-sm text-ink/40">§02</span>
          <h2 id="users-heading" className="text-h3 text-ink">Users.</h2>
          {!loading && (
            <span className="text-mono-sm text-ink/40">
              {String(users.length).padStart(3, "0")} total
            </span>
          )}
        </header>

        <div className="border border-ink/15 overflow-x-auto">
          {loading ? (
            <div className="p-6 flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="text-mono-sm text-ink/55 text-center py-12">No users found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/15 text-left">
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Plan</Th>
                  <Th align="right">Credits</Th>
                  <Th>Role</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-ink/10 last:border-0">
                    <td className="px-5 py-3 text-ink">{u.name}</td>
                    <td className="px-5 py-3 text-mono-sm text-ink/70">{u.email}</td>
                    <td className="px-5 py-3">
                      <Badge variant="secondary">{u.plan}</Badge>
                    </td>
                    <td className="px-5 py-3 text-mono-sm text-ink tabular-nums text-right">
                      {u.credits}
                    </td>
                    <td className="px-5 py-3">
                      {u.is_admin ? (
                        <Badge variant="default">Admin</Badge>
                      ) : (
                        <Badge variant="outline">User</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
}) {
  return (
    <div className="bg-paper p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-mono-sm text-ink/40">{label}</span>
        <Icon className="h-4 w-4 text-ink/55" />
      </div>
      <span className="text-h2 text-ink tabular-nums leading-none">{value}</span>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "px-5 py-3 text-mono-sm text-ink/40 font-normal",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}
