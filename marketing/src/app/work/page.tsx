"use client";

import { useState, useTransition } from "react";
import { WorkCard } from "@/components/work/WorkCard";
import { WorkDrawer } from "@/components/work/WorkDrawer";
import { workItems, type WorkItem } from "@/content/work";

/**
 * /work — gallery (per brief §4.3).
 *
 * Single CSS grid with grid-auto-flow: dense; cards occupy 1, 2, or 3
 * cells. Click reveals a side drawer via the native View Transitions
 * API (per brief: not a modal). Each card pairs with its drawer hero
 * via matching `view-transition-name`.
 */
export default function WorkPage() {
  const [active, setActive] = useState<WorkItem | null>(null);
  const [, startTransition] = useTransition();

  const open = (item: WorkItem) => {
    if (typeof document.startViewTransition === "function") {
      // Wrapping the state update in startViewTransition pairs the card
      // and drawer thumbnails by `view-transition-name`.
      document.startViewTransition(() => {
        startTransition(() => setActive(item));
      });
    } else {
      setActive(item);
    }
  };

  const close = () => {
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(() => {
        startTransition(() => setActive(null));
      });
    } else {
      setActive(null);
    }
  };

  return (
    <main
      id="main"
      className="px-[var(--gutter)] pb-[clamp(96px,12vh,192px)] pt-[clamp(48px,8vh,128px)] flex flex-col gap-12"
    >
      <header className="flex flex-col gap-4">
        <span className="text-mono-sm text-ink/50">Work · 2026</span>
        <h1 className="text-display max-w-[14ch]">Output, indexed.</h1>
        <p className="text-h3 text-ink/80 max-w-[62ch]">
          Selected renders, with their metadata. Each clip is the artefact
          of a prompt, a seed, a model, and a render time. Click any cell
          for the full record.
        </p>
      </header>

      <section
        aria-label="Renders"
        className="grid grid-cols-2 lg:grid-cols-3 gap-4"
        style={{ gridAutoFlow: "dense" }}
      >
        {workItems.map((item) => (
          <WorkCard key={item.id} item={item} onSelect={open} />
        ))}
      </section>

      <WorkDrawer item={active} onClose={close} />
    </main>
  );
}
