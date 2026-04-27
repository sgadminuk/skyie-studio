"use client";

import { useEffect, useRef, useState } from "react";
import { DriftMark } from "@/components/brand/DriftMark";
import { TimeStamp } from "@/components/system/TimeStamp";
import { useMotionEnabled } from "@/components/system/MotionPolicyProvider";
import {
  heroByline,
  heroLedger,
  heroPhrases,
} from "@/content/home";

/**
 * §1 Hero — the make-or-break section (per brief §4.1, §10).
 *
 * - Drift mark, very large (clamp 240px → 600px height).
 * - A single huge phrase auto-typewritten over ~1.6s, idling for ~6.4s,
 *   then re-typed with the next phrase. Loop is paused under reduced
 *   motion (the first phrase is shown statically).
 * - Sub-line in mono.
 * - Right-edge ledger: live UTC clock + queue / model / region.
 *
 * Layout: a 12-col grid, but content lives on cols 1, 5, 9, 12 (per the
 * "asymmetry over symmetry" directive in §1).
 */

const PHRASE_HOLD_MS = 6400;
const PHRASE_TYPE_MS = 1600;
const PHRASE_DELETE_MS = 600;

export function Hero() {
  const motionEnabled = useMotionEnabled();
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [text, setText] = useState<string>(heroPhrases[0]);
  const [caret, setCaret] = useState(true);
  const phaseRef = useRef<"hold" | "delete" | "type">("hold");

  // Caret blink — independent of typing
  useEffect(() => {
    if (!motionEnabled) {
      setCaret(false);
      return;
    }
    const id = window.setInterval(() => setCaret((c) => !c), 600);
    return () => window.clearInterval(id);
  }, [motionEnabled]);

  // Phrase loop
  useEffect(() => {
    if (!motionEnabled) {
      setText(heroPhrases[0]);
      setPhraseIdx(0);
      return;
    }

    let raf = 0;
    let phaseStart = performance.now();
    phaseRef.current = "hold";
    let current = heroPhrases[phraseIdx % heroPhrases.length] ?? "";
    setText(current);

    const tick = (now: number) => {
      const dt = now - phaseStart;
      const phase = phaseRef.current;

      if (phase === "hold") {
        if (dt >= PHRASE_HOLD_MS) {
          phaseRef.current = "delete";
          phaseStart = now;
        }
      } else if (phase === "delete") {
        const t = Math.min(dt / PHRASE_DELETE_MS, 1);
        const len = Math.max(0, Math.round(current.length * (1 - t)));
        setText(current.slice(0, len));
        if (t >= 1) {
          phaseRef.current = "type";
          phaseStart = now;
          const next = (phraseIdx + 1) % heroPhrases.length;
          current = heroPhrases[next] ?? "";
          setPhraseIdx(next);
        }
      } else if (phase === "type") {
        const t = Math.min(dt / PHRASE_TYPE_MS, 1);
        const len = Math.round(current.length * t);
        setText(current.slice(0, len));
        if (t >= 1) {
          phaseRef.current = "hold";
          phaseStart = now;
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionEnabled]);

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative min-h-[100svh] px-[var(--gutter)] pt-12 pb-16 grid grid-cols-12 gap-x-[var(--gutter)] gap-y-12"
    >
      {/* Massive Drift mark, columns 1–8 */}
      <div className="col-span-12 lg:col-span-8 flex items-center">
        <DriftMark
          variant="full"
          size="100%"
          speed={5}
          className="text-ink"
          style={{
            height: "clamp(180px, 36vh, 600px)",
            width: "auto",
            maxWidth: "100%",
          }}
        />
      </div>

      {/* Right-edge ledger, columns 9–12 */}
      <aside
        aria-label="Studio telemetry"
        className="col-span-12 lg:col-span-4 lg:col-start-9 self-start lg:pt-2 flex flex-col gap-3"
      >
        {heroLedger.map((row, i) => (
          <LedgerRow key={i} row={row} />
        ))}
      </aside>

      {/* Phrase + sub-line, full width — the "massive" phrase needs the
          whole row to stay on a single line at lg+ viewports. */}
      <div className="col-span-12 flex flex-col gap-6 mt-8">
        <h1
          id="hero-heading"
          className="text-display text-ink"
          aria-live="polite"
          aria-atomic
          style={{ textWrap: "balance" }}
        >
          <span className="inline-block min-h-[1em]">
            {text}
            <span
              className={`ml-1 inline-block w-[0.08em] h-[0.85em] -mb-[0.1em] align-baseline bg-signal ${caret ? "opacity-100" : "opacity-0"}`}
              aria-hidden
            />
          </span>
        </h1>
        <p className="text-mono-sm text-ink/65 max-w-[64ch]">{heroByline}</p>
      </div>

      {/* Section index marker — bottom right */}
      <span
        aria-hidden
        className="col-span-12 self-end justify-self-end text-mono-sm text-ink/30 mt-12"
      >
        §01 / 07
      </span>
    </section>
  );
}

function LedgerRow({ row }: { row: (typeof heroLedger)[number] }) {
  return (
    <div className="grid grid-cols-[6ch_1fr] gap-3 items-baseline">
      <span className="text-mono-sm text-ink/40">{row.label}</span>
      {row.kind === "clock" ? (
        <TimeStamp className="text-ink" />
      ) : (
        <span className="text-mono-sm text-ink tabular-nums">{row.value}</span>
      )}
    </div>
  );
}
