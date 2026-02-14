"use client";

import { useEffect, useState } from "react";
import { Shield, Users, Cpu, Clock, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-7 w-7" />
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Platform overview and user management
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-5 rounded" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : stats ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Users
                </CardTitle>
                <Users className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.total_users}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Jobs
                </CardTitle>
                <Cpu className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.total_jobs}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  GPU Hours
                </CardTitle>
                <Clock className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.gpu_hours.toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Jobs
                </CardTitle>
                <Loader2 className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.active_jobs}</p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No users found
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Email</th>
                    <th className="pb-3 pr-4 font-medium">Plan</th>
                    <th className="pb-3 pr-4 font-medium">Credits</th>
                    <th className="pb-3 font-medium">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{u.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{u.email}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary">{u.plan}</Badge>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{u.credits}</td>
                      <td className="py-3">
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
