"use client";

import { useEffect, useRef, useState } from "react";
import { specimenClips } from "@/content/home";
import { mapRange } from "@/lib/motion";
import { DriftMark } from "@/components/brand/DriftMark";
import { useMotionEnabled } from "@/components/system/MotionPolicyProvider";

/**
 * §3 Specimen — scroll-scrub videos (per brief §4.1).
 *
 * Three clips, switched by horizontal arrow keys / nav buttons. The
 * active clip's currentTime is bound to the scroll position of the
 * section. A mono caption ledger shows prompt / model / seed / render
 * time alongside.
 *
 * If the source video isn't shipped (404) or hasn't loaded yet, the
 * section renders a procedural Drift placeholder so the section is
 * never empty. The video fades in only after `loadeddata` fires; on
 * `error` it stays hidden.
 *
 * Reduced motion: the active video gets `controls`. Switching still works.
 */

export function Specimen() {
  const motionEnabled = useMotionEnabled();
  const [activeIdx, setActiveIdx] = useState(0);
  const [readyMap, setReadyMap] = useState<Record<string, boolean>>({});
  const sectionRef = useRef<HTMLElement>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  // Keyboard nav between clips
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|textarea/i.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") {
        setActiveIdx((i) => Math.min(specimenClips.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setActiveIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Scroll-scrub the active video — only when it's actually ready.
  useEffect(() => {
    const el = sectionRef.current;
    const video = videoRefs.current[activeIdx];
    const clip = specimenClips[activeIdx];
    if (!el || !video || !clip) return;
    if (!readyMap[clip.id]) return;

    if (!motionEnabled) {
      video.controls = true;
      return;
    }
    video.controls = false;

    let raf = 0;
    let dirty = true;
    const onScroll = () => {
      dirty = true;
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      raf = 0;
      if (!dirty) return;
      dirty = false;
      const dur = video.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const total = rect.height + vh;
      const traversed = vh - rect.top;
      const t = mapRange(traversed, 0, total, 0, 1);
      try {
        video.currentTime = t * dur;
      } catch {
        /* video may not be seekable yet */
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [activeIdx, motionEnabled, readyMap]);

  const clip = specimenClips[activeIdx]!;
  const activeReady = !!readyMap[clip.id];

  return (
    <section
      ref={sectionRef}
      aria-labelledby="specimen-heading"
      className="relative px-[var(--gutter)] py-[clamp(64px,12vh,160px)]"
      data-cv="auto"
    >
      <header className="mb-10 flex items-baseline justify-between gap-6 flex-wrap">
        <div className="flex items-baseline gap-4">
          <span className="text-mono-sm text-ink/40">§03</span>
          <h2 id="specimen-heading" className="text-h2">
            Specimen.
          </h2>
        </div>
        <nav aria-label="Specimen clips" className="flex items-center gap-3">
          {specimenClips.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-current={i === activeIdx ? "true" : undefined}
              className={[
                "text-mono-sm tracking-[0.2em] uppercase px-2 py-1",
                "border transition-colors",
                i === activeIdx
                  ? "border-ink text-ink"
                  : "border-transparent text-ink/45 hover:text-ink/80",
              ].join(" ")}
              data-cursor="ring"
            >
              {String(i + 1).padStart(2, "0")}
            </button>
          ))}
        </nav>
      </header>

      <div className="grid grid-cols-12 gap-x-[var(--gutter)] gap-y-8">
        <div className="col-span-12 lg:col-span-9">
          <div className="relative bg-char/5 aspect-video overflow-hidden">
            {/* Procedural placeholder · always rendered behind videos.
                Visible until the video reports loadeddata. */}
            <div
              aria-hidden
              className="absolute inset-0 flex items-center justify-center text-ink"
            >
              <DriftMark
                size="60%"
                speed={5 + activeIdx * 1.5}
                style={{ height: "60%", width: "auto" }}
              />
              <span className="absolute bottom-4 left-4 text-mono-sm text-ink/45">
                {clip.id} · awaiting source · scroll-scrub idle
              </span>
            </div>

            {specimenClips.map((c, i) => (
              <video
                key={c.id}
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                src={c.src}
                poster={c.poster}
                preload="metadata"
                muted
                playsInline
                onLoadedData={() =>
                  setReadyMap((m) => ({ ...m, [c.id]: true }))
                }
                onError={() =>
                  setReadyMap((m) => ({ ...m, [c.id]: false }))
                }
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
                style={{
                  opacity: i === activeIdx && activeReady ? 1 : 0,
                  pointerEvents:
                    i === activeIdx && activeReady ? "auto" : "none",
                }}
                aria-label={c.title}
              />
            ))}

            {/* Title label — always on top */}
            <span className="absolute top-3 left-3 text-mono-sm text-ink bg-paper/95 px-2 py-1 z-10">
              {clip.title}
            </span>
          </div>
        </div>

        <dl className="col-span-12 lg:col-span-3 flex flex-col gap-3 text-mono-sm self-start">
          {clip.caption.map((row) => (
            <div key={row.k} className="grid grid-cols-[6ch_1fr] gap-2 items-baseline">
              <dt className="text-ink/40">{row.k}</dt>
              <dd className="text-ink/85 break-words">{row.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-10 text-mono-sm text-ink/45">
        {activeReady
          ? "Scroll to scrub the clip. ← / → switch between clips."
          : "← / → switch between clips. Source video not yet shipped — placeholder shown."}
      </p>
    </section>
  );
}
