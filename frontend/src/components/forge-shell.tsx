"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, Sparkles, ImagePlus, Film, Users, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

/**
 * ForgeShell — chrome for the gated open-weights platform.
 *
 * Distinct visual identity from Studio:
 *   - amber/orange accent (Studio is signal-blue) so users always know
 *     which engine they're driving
 *   - condensed top nav rather than the wide sidebar — Forge has fewer
 *     workflows than Studio does and the surface is meant to feel raw
 *   - "FORGE" wordmark, not "Skyie"
 */

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Flame, exact: true },
  { href: "/image", label: "Image", icon: ImagePlus, soon: true },
  { href: "/video", label: "Video", icon: Film, soon: true },
  { href: "/characters", label: "Characters", icon: Users, soon: true },
];

export function ForgeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  // The middleware rewrites forge.skyie.studio/foo → /forge/foo. We compare
  // pathname against the rewritten form when checking active links.
  const matches = (href: string, exact: boolean) => {
    const target = href === "/" ? "/forge" : `/forge${href}`;
    if (exact) return pathname === target;
    return pathname === target || pathname.startsWith(target + "/");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-800/70 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <Flame className="h-5 w-5 text-amber-500" strokeWidth={2.5} />
            <span className="text-sm uppercase tracking-[0.2em] text-amber-500">Forge</span>
          </Link>
          <nav className="ml-2 flex items-center gap-1 text-sm">
            {NAV_ITEMS.map(({ href, label, icon: Icon, exact, soon }) => {
              const active = matches(href, exact ?? false);
              const className = cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
                soon
                  ? "cursor-not-allowed text-zinc-600"
                  : active
                    ? "bg-amber-500/10 text-amber-400"
                    : "text-zinc-400 hover:text-zinc-100",
              );
              if (soon) {
                return (
                  <span key={href} className={className} title="Coming soon">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    <span className="ml-1 rounded bg-zinc-800 px-1 text-[9px] uppercase tracking-wider text-zinc-500">soon</span>
                  </span>
                );
              }
              return (
                <Link key={href} href={href} className={className}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-zinc-400">
            <Link
              href="/dashboard"
              className="rounded-md border border-zinc-800 px-2.5 py-1 transition-colors hover:border-zinc-600 hover:text-zinc-200"
              title="Open Skyie Studio"
            >
              <Sparkles className="mr-1 inline h-3 w-3" />
              Studio
            </Link>
            {user && (
              <>
                <span className="hidden sm:inline tabular-nums">{user.email}</span>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-md p-1.5 text-zinc-500 transition-colors hover:text-zinc-200"
                  title="Log out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
