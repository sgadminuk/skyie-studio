"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wand2,
  Library,
  Settings,
  Video,
  Mic,
  Film,
  ChevronLeft,
  FolderOpen,
  Shield,
  ImagePlus,
  RefreshCw,
  Sparkles,
  Layers,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DriftMark } from "@/components/skyie/DriftMark";

/**
 * Sidebar — Skyie-native re-skin.
 *
 * Per-route wayfinding still owned here (NAV_ITEMS, CREATE_ITEMS) so
 * existing routes keep working. The chrome is rebuilt:
 *   - Drift mark logo (animated, 24px collapsed / scaled when expanded)
 *   - mono-uppercase nav labels with a 1-character numeric index
 *   - signal-blue active state (left rail bar + ink fill)
 *   - sharp edges (no rounded corners), thin 1px dividers
 *   - hover/focus is signal-blue ring, never a background pill
 */

const NAV_ITEMS = [
  { href: "/",         label: "Dashboard", icon: LayoutDashboard, idx: "01" },
  { href: "/create",   label: "Create",    icon: Wand2,           idx: "02" },
  { href: "/brand",    label: "Brand Kit", icon: Palette,         idx: "03" },
  { href: "/library",  label: "Library",   icon: Library,         idx: "04" },
  { href: "/projects", label: "Projects",  icon: FolderOpen,      idx: "05" },
  { href: "/settings", label: "Settings",  icon: Settings,        idx: "06" },
];

const CREATE_ITEMS = [
  { href: "/create/studio",       label: "Gemini Studio",     icon: Layers,    idx: "01" },
  { href: "/create/multi-shot",   label: "Multi-Shot Studio", icon: Film,      idx: "02" },
  { href: "/create/director",     label: "AI Director",       icon: Sparkles,  idx: "03" },
  { href: "/create/shots",        label: "Shot Creator",      icon: ImagePlus, idx: "04" },
  { href: "/create/v2v",          label: "Video Transform",   icon: RefreshCw, idx: "05" },
  { href: "/create/talking-head", label: "Talking Head",      icon: Mic,       idx: "06" },
  { href: "/create/broll",        label: "B-Roll",            icon: Film,      idx: "07" },
  { href: "/create/production",   label: "Full Production",   icon: Video,     idx: "08" },
  { href: "/create/storyboard",   label: "Storyboard",        icon: Film,      idx: "09" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, toggle } = useSidebar();
  const { user } = useAuth();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-ink/15 bg-paper transition-[width] duration-300 ease-out-skyie",
        isOpen ? "w-64" : "w-16",
      )}
      aria-label="Primary navigation"
    >
      {/* Logo row */}
      <div className="flex h-16 items-center justify-between border-b border-ink/15 px-3">
        <Link
          href="/"
          aria-label="Skyie Studio · home"
          className="flex items-center gap-3 text-ink"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-ink">
            <DriftMark size={20} variant="full" speed={4} className="text-paper" />
          </div>
          {isOpen && (
            <span className="text-mono-sm tracking-[0.22em]">SKYIE STUDIO</span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={isOpen ? "Collapse navigation" : "Expand navigation"}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-ink/60 transition-colors hover:text-ink"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", !isOpen && "rotate-180")} />
        </button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="flex flex-col">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              idx={item.idx}
              icon={item.icon}
              isOpen={isOpen}
              isActive={
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href)
              }
            />
          ))}

          {user?.is_admin && (
            <NavLink
              href="/admin"
              label="Admin"
              idx="07"
              icon={Shield}
              isOpen={isOpen}
              isActive={pathname.startsWith("/admin")}
            />
          )}
        </nav>

        {/* Create sub-nav (only shown on /create/*) */}
        {isOpen && pathname.startsWith("/create") && (
          <div className="mt-6 border-t border-ink/15 pt-4">
            <p className="mb-2 px-4 text-mono-sm text-ink/40">Workflows</p>
            <nav className="flex flex-col">
              {CREATE_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  idx={item.idx}
                  icon={item.icon}
                  isOpen={isOpen}
                  isActive={pathname === item.href}
                  variant="sub"
                />
              ))}
            </nav>
          </div>
        )}
      </ScrollArea>

      {/* Footer · version + mark slice */}
      <div className="border-t border-ink/15 px-4 py-4">
        {isOpen ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-mono-sm text-ink/40">v0.1.0</span>
            <span className="text-ink/30">
              <DriftMark variant="slice" size={88} speed={8} />
            </span>
          </div>
        ) : (
          <div className="flex justify-center text-ink/30">
            <DriftMark variant="slice" size={28} speed={8} />
          </div>
        )}
      </div>
    </aside>
  );
}

function NavLink({
  href,
  label,
  idx,
  icon: Icon,
  isOpen,
  isActive,
  variant = "primary",
}: {
  href: string;
  label: string;
  idx: string;
  icon: typeof LayoutDashboard;
  isOpen: boolean;
  isActive: boolean;
  variant?: "primary" | "sub";
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 px-4 py-2.5 transition-colors",
        // Active rail bar — 2px signal on left edge
        isActive ? "text-ink" : "text-ink/55 hover:text-ink",
        !isOpen && "justify-center px-2",
      )}
    >
      {/* Left active rail */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[2px] transition-colors",
          isActive ? "bg-signal" : "bg-transparent",
        )}
      />

      <Icon className={cn("h-4 w-4 shrink-0", variant === "sub" && "h-[14px] w-[14px]")} />

      {isOpen && (
        <span className="flex flex-1 items-baseline gap-2 truncate">
          <span className="text-mono-sm text-ink/30 tabular-nums">{idx}</span>
          <span
            className={cn(
              "truncate",
              variant === "primary"
                ? "text-mono-sm tracking-[0.16em]"
                : "text-[0.8125rem]",
            )}
          >
            {variant === "primary" ? label.toUpperCase() : label}
          </span>
        </span>
      )}
    </Link>
  );
}
