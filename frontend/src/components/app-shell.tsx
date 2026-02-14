"use client";

import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { useSidebar } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isOpen } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className={cn(
          "flex flex-col transition-all duration-300",
          isOpen ? "ml-64" : "ml-16"
        )}
      >
        <Topbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
