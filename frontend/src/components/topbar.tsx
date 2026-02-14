"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/lib/store";

export function Topbar() {
  const { toggle } = useSidebar();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={toggle}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm">
          <span className="font-medium">50</span>
          <span className="text-muted-foreground">credits</span>
        </div>
      </div>
    </header>
  );
}
