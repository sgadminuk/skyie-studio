"use client";

import { useEffect, useRef } from "react";
import type { WorkItem } from "@/content/work";
import { useMotionEnabled } from "@/components/system/MotionPolicyProvider";

/**
 * <WorkCard /> — a single grid cell. Loops a silent video when in view,
 * pauses out of view. Click invokes onSelect (the page handles the
 * View Transition into the drawer).
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

  // Play/pause based on intersection — never both autoplay all 7 at once.
  useEffect(() => {
    const video = videoRef.current;
    const wrap = wrapRef.current;
    if (!video || !wrap) return;
    if (!motionEnabled) {
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
  }, [motionEnabled]);

  const aspectClass = aspectToClass(item.aspect);
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
      // Per-element view-transition name so the framework
      // animates the card into the drawer thumbnail.
      style={{ viewTransitionName: `work-${item.id}` }}
    >
      <div className={`relative w-full ${aspectClass}`}>
        <video
          ref={videoRef}
          src={item.src}
          poster={item.poster}
          preload="metadata"
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden
        />
      </div>
      <span
        className="absolute top-3 left-3 text-mono-sm text-paper bg-ink/85 px-2 py-1"
      >
        {item.ref}
      </span>
      <div className="absolute bottom-0 inset-x-0 p-4 bg-ink text-paper opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
        <span className="text-mono-sm tracking-[0.16em] uppercase">
          {item.title}
        </span>
      </div>
    </button>
  );
}

function aspectToClass(a: WorkItem["aspect"]): string {
  switch (a) {
    case "16:9":
      return "aspect-[16/9]";
    case "4:3":
      return "aspect-[4/3]";
    case "1:1":
      return "aspect-square";
    case "9:16":
      return "aspect-[9/16]";
    case "21:9":
      return "aspect-[21/9]";
  }
}
