"use client";

import Link from "next/link";
import { Menu, LogOut, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { TimeStamp } from "@/components/skyie/TimeStamp";
import { cn } from "@/lib/utils";

/**
 * Topbar — Skyie-native re-skin. Telemetry over chrome.
 *
 *   left  · sidebar toggle (mobile only)
 *   mid   · live UTC clock + credits readout (instrument-style)
 *   right · user identity (mono initials in a 32px square + dropdown)
 *
 * No backdrop-blur-sm (per the brand anti-pattern list).
 */
export function Topbar() {
  const { toggle } = useSidebar();
  const { user, logout } = useAuth();

  return (
    <header
      role="banner"
      className="sticky top-0 z-20 flex h-16 items-center gap-6 border-b border-ink/15 bg-paper px-6"
    >
      <button
        type="button"
        onClick={toggle}
        aria-label="Toggle navigation"
        className="flex h-8 w-8 items-center justify-center text-ink/60 transition-colors hover:text-ink md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Telemetry strip · only visible on ≥ sm */}
      <div className="hidden sm:flex items-center gap-6 flex-1 min-w-0">
        <Ledger label="UTC">
          <TimeStamp className="text-ink" />
        </Ledger>
        {user && (
          <Ledger label="Credits">
            <span
              className={cn(
                "text-mono-sm tabular-nums text-ink",
                user.credits < 10 && "text-signal",
              )}
            >
              {user.credits.toString().padStart(4, "0")}
            </span>
          </Ledger>
        )}
        {user && (
          <Ledger label="Plan">
            <span className="text-mono-sm tracking-[0.18em] uppercase text-ink">
              {user.plan ?? "—"}
            </span>
          </Ledger>
        )}
      </div>

      <div className="flex flex-1 sm:flex-initial items-center justify-end gap-3">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="group flex h-9 items-center gap-3 border border-ink/20 px-2.5 transition-colors hover:border-ink"
              >
                <span className="flex h-6 w-6 items-center justify-center bg-ink text-paper text-mono-sm tracking-wider">
                  {getInitials(user.name)}
                </span>
                <span className="hidden md:inline text-mono-sm text-ink">
                  {firstName(user.name)}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-3 py-2">
                <p className="text-sm text-ink">{user.name}</p>
                <p className="text-mono-sm text-ink/55 mt-1">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  <UserIcon className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link
            href="/login"
            className="text-mono-sm tracking-[0.18em] uppercase border border-ink px-4 py-2 text-ink hover:bg-ink hover:text-paper transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

function Ledger({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-mono-sm text-ink/40">{label}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}
