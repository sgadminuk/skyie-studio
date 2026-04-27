"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkItem } from "@/content/work";
import { DriftMark } from "@/components/brand/DriftMark";
import { useMotionEnabled } from "@/components/system/MotionPolicyProvider";

/**
 * <WorkCard /> — a single grid cell. Loops a silent video when in view,
 * pauses out of view. Falls back to a procedural Drift placeholder when
 * the source video isn't shipped (404). Click invokes onSelect (the
 * page handles the View Transition into the drawer).
 *
 * The card height is driven by the explicit grid-auto-rows on the parent
 * grid (a fixed pixel height), not by the video's intrinsic aspect.
 * Each card simply fills its grid cell. This keeps the gallery compact
 * even when items have wildly different content aspects (9:16, 21:9, 1:1).
 */

export function WorkCard({
  item,
  onSelect,
}: {
  item: WorkItem;
  onSelect: (item: WorkItem) => void;
}) {
  const motionEnabled = useMotionEnabled();
  const wrapRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  // Play/pause based on intersection — never autoplay all 7 at once.
  useEffect(() => {
    const video = videoRef.current;
    const wrap = wrapRef.current;
    if (!video || !wrap) return;
    if (!motionEnabled || !ready) {
      video.pause();
      return;
    }
    const ob = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void video.play().catch(() => {
            /* autoplay rejected — leave as poster */
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );
    ob.observe(wrap);
    return () => ob.disconnect();
  }, [motionEnabled, ready]);

  const colSpan =
    item.span === 3
      ? "col-span-2 lg:col-span-3"
      : item.span === 2
        ? "col-span-2"
        : "col-span-1";
  const rowSpan = item.rowSpan === 2 ? "row-span-2" : "row-span-1";

  return (
    <button
      ref={wrapRef}
      type="button"
      onClick={() => onSelect(item)}
      className={[
        "group relative bg-char/5 overflow-hidden text-left",
        "transition-opacity hover:opacity-95",
        colSpan,
        rowSpan,
      ].join(" ")}
      aria-label={`${item.title}. Open details.`}
      data-cursor="ring"
      // Per-element view-transition name pairs this card with its
      // drawer hero on open / close.
      style={{ viewTransitionName: `work-${item.id}` }}
    >
      {/* Procedural placeholder · always rendered; video covers it on load. */}
      <div className="absolute inset-0 flex items-center justify-center text-ink/80 pointer-events-none">
        <DriftMark
          size="50%"
          speed={4 + (item.id.length % 4)}
          style={{ height: "60%", width: "auto" }}
        />
      </div>

      <video
        ref={videoRef}
        src={item.src}
        poster={item.poster}
        preload="metadata"
        muted
        loop
        playsInline
        onLoadedData={() => setReady(true)}
        onError={() => setReady(false)}
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
        style={{ opacity: ready ? 1 : 0 }}
        aria-hidden
      />

      <span className="absolute top-3 left-3 text-mono-sm text-paper bg-ink px-2 py-1 z-10">
        {item.ref}
      </span>
      <div className="absolute bottom-0 inset-x-0 p-4 bg-ink text-paper opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity z-10">
        <span className="text-mono-sm tracking-[0.16em] uppercase block">
          {item.title}
        </span>
        <span className="text-mono-sm text-paper/60 mt-1 block">
          {item.aspect} · {item.blurb}
        </span>
      </div>
    </button>
  );
}
