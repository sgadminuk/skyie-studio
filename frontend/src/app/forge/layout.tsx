"use client";

import { ProtectedRoute } from "@/components/protected-route";
import { ForgeShell } from "@/components/forge-shell";

/**
 * Forge route-group layout — every authenticated route under
 * `/forge/*`. Lives behind two gates:
 *
 *   1. Cloudflare Access on `forge.skyie.studio` blocks the public from
 *      ever reaching this code (edge-level email allowlist).
 *   2. The backend `require_forge_user` dependency on every
 *      `/api/v1/forge/*` route checks `users.forge_enabled` for the
 *      caller's JWT. So even with a Studio JWT, API calls 403 unless
 *      the flag is set.
 *
 * This layout is the third gate at the UI level — `<ForgeNotEnrolled>`
 * shows up if the API tells us the user isn't enrolled, instead of
 * a confusing blank page.
 */
export default function ForgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <ForgeShell>{children}</ForgeShell>
    </ProtectedRoute>
  );
}
