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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/create", label: "Create", icon: Wand2 },
  { href: "/library", label: "Library", icon: Library },
  { href: "/settings", label: "Settings", icon: Settings },
];

const CREATE_ITEMS = [
  { href: "/create/talking-head", label: "Talking Head", icon: Mic },
  { href: "/create/broll", label: "B-Roll", icon: Film },
  { href: "/create/production", label: "Full Production", icon: Video },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, toggle } = useSidebar();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r bg-card transition-all duration-300",
        isOpen ? "w-64" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4">
        {isOpen && (
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Video className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">Skyie Studio</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className={cn("h-8 w-8", !isOpen && "mx-auto")}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              !isOpen && "rotate-180"
            )}
          />
        </Button>
      </div>

      <Separator />

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  !isOpen && "justify-center px-2"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {isOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Create sub-nav */}
        {isOpen && pathname.startsWith("/create") && (
          <>
            <Separator className="my-4" />
            <div className="space-y-1">
              <p className="px-3 text-xs font-semibold uppercase text-muted-foreground">
                Workflows
              </p>
              {CREATE_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </ScrollArea>

      {/* Footer */}
      {isOpen && (
        <div className="border-t p-4">
          <p className="text-xs text-muted-foreground">
            Skyie Studio v0.1.0
          </p>
        </div>
      )}
    </aside>
  );
}
