"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkItem } from "@/content/marketing/work";
import { DriftMark } from "@/components/skyie/DriftMark";

/**
 * <WorkDrawer /> — side drawer (not a modal). Opens with a View
 * Transition from the card thumbnail into the drawer's hero video.
 *
 * We use the native View Transitions API for the reveal (per brief
 * §4.3). React 19 ships <ViewTransition> as a wrapper, but this drawer
 * is mount/unmount, not a route change — so we drive it imperatively.
 */

export function WorkDrawer({
  item,
  onClose,
}: {
  item: WorkItem | null;
  onClose: () => void;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  // Reset readiness when the active item changes.
  useEffect(() => {
    setVideoReady(false);
  }, [item?.id]);

  // Focus management + Escape key
  useEffect(() => {
    if (!item) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [item, onClose]);

  if (!item) return null;

  return (
    <>
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="fixed inset-0 z-[7000] bg-ink/40 cursor-pointer"
        style={{ viewTransitionName: "work-drawer-scrim" }}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed top-0 right-0 bottom-0 z-[7001] w-full sm:w-[min(720px,90vw)] bg-paper overflow-y-auto p-6 sm:p-10 flex flex-col gap-8"
        style={{ viewTransitionName: "work-drawer" }}
      >
        <header className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-mono-sm text-ink/40">{item.ref}</span>
            <h2 id="drawer-title" className="text-h2 text-ink">
              {item.title}
            </h2>
            <p className="text-ink/75 max-w-[60ch]">{item.blurb}</p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="text-mono-sm uppercase tracking-[0.18em] border border-ink px-3 py-1 hover:bg-ink hover:text-paper transition-colors cursor-pointer"
            data-cursor="ring"
          >
            Close
          </button>
        </header>

        <div
          className="relative bg-char/5 overflow-hidden aspect-video"
          style={{ viewTransitionName: `work-${item.id}` }}
        >
          {/* Procedural placeholder · always rendered behind the video. */}
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-ink/80 pointer-events-none"
          >
            <DriftMark size="40%" speed={5} style={{ height: "60%", width: "auto" }} />
            <span className="absolute bottom-3 left-3 text-mono-sm text-ink/45">
              {item.ref} · awaiting source
            </span>
          </div>

          <video
            src={item.src}
            poster={item.poster}
            controls
            preload="metadata"
            onLoadedData={() => setVideoReady(true)}
            onError={() => setVideoReady(false)}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
            style={{ opacity: videoReady ? 1 : 0 }}
            aria-label={`${item.title}, full clip`}
          />
        </div>

        <dl className="grid grid-cols-[6rem_1fr] gap-3 text-mono-sm">
          {item.meta.map((row) => (
            <div key={row.k} className="contents">
              <dt className="text-ink/40">{row.k}</dt>
              <dd className="text-ink/85 break-words">{row.v}</dd>
            </div>
          ))}
        </dl>

        {item.notes.length ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-mono-sm text-ink/40 mb-1">Notes</h3>
            {item.notes.map((n, i) => (
              <p key={i} className="text-ink/80">
                {n}
              </p>
            ))}
          </section>
        ) : null}
      </div>
    </>
  );
}
