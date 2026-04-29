"use client";

// Forge job detail = same component as the dashboard's job detail page.
// Re-export keeps logic in one place; the route lives here so middleware's
// `forge.skyie.studio/jobs/<id>` → `/forge/jobs/<id>` rewrite resolves.
//
// The page itself is layout-agnostic — wraps in whatever layout the
// route group provides (ForgeShell here, AppShell on /dashboard).

export { default } from "@/app/dashboard/jobs/[id]/page";
