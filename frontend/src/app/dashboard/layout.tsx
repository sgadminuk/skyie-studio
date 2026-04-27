"use client";

import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";

/**
 * Dashboard route-group layout — wraps every authenticated route under
 * `/dashboard/*`. Handles the auth gate + the sidebar/topbar shell.
 *
 * Public surfaces (`/`, `/system`, `/work`, `/access`, `/manifesto`,
 * `/login`, `/register`) render under different layouts and never see
 * this guard.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}
