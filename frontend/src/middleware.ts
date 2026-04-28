import { NextRequest, NextResponse } from "next/server";

/**
 * Hostname-based routing for the unified Skyie app.
 *
 *   skyie.studio          → marketing (root paths render the (marketing) group)
 *   app.skyie.studio      → dashboard (rewrite /foo → /dashboard/foo)
 *   forge.skyie.studio    → forge    (rewrite /foo → /forge/foo)
 *   localhost / preview   → all surfaces accessible directly:
 *                             /              marketing apex
 *                             /dashboard/*   authenticated app
 *                             /forge/*       gated open-weights platform
 *
 * The rewrite is invisible to the user — the address bar still shows
 * `app.skyie.studio/library`, but Next renders `/dashboard/library`.
 */

const APP_HOSTS = new Set([
  "app.skyie.studio",
  "app.localhost",
  "app.localhost:3000",
]);

const FORGE_HOSTS = new Set([
  "forge.skyie.studio",
  "forge.localhost",
  "forge.localhost:3000",
]);

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const { pathname, search } = req.nextUrl;

  if (FORGE_HOSTS.has(host)) {
    if (
      pathname.startsWith("/forge") ||
      pathname === "/login" ||
      pathname === "/register" ||
      pathname.startsWith("/api/")
    ) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = `/forge${pathname === "/" ? "" : pathname}`;
    url.search = search;
    return NextResponse.rewrite(url);
  }

  if (!APP_HOSTS.has(host)) {
    return NextResponse.next();
  }

  // Already targeting /dashboard, /login, /register, /api — let it through.
  if (
    pathname.startsWith("/dashboard") ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }

  // Map app-host root paths into the dashboard segment.
  const url = req.nextUrl.clone();
  url.pathname = `/dashboard${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    // Skip static assets and image optimisation routes.
    "/((?!_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|otf|css|js|map)).*)",
  ],
};
