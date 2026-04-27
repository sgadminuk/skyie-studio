"use client";

import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { useSidebar } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * AppShell — outer chrome for every authenticated route.
 *
 * Layout:
 *   - sidebar (fixed, w-64 expanded / w-16 collapsed)
 *   - main column shifts left by sidebar width via margin
 *   - topbar sticky at top of main column
 *   - <main id="main"> takes the remaining space, gutter-padded
 *
 * Sharp edges, paper background, no decorative shadows.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { isOpen } = useSidebar();

  return (
    <div className="min-h-screen bg-paper">
      <Sidebar />
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[margin] duration-300 ease-out-skyie",
          isOpen ? "ml-64" : "ml-16",
        )}
      >
        <Topbar />
        <main
          id="main"
          className="flex-1 px-(--gutter) py-[clamp(20px,3vh,40px)]"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
