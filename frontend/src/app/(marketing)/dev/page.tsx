import { DriftMark } from "@/components/skyie/DriftMark";
import { Counter } from "@/components/marketing/motion/Counter";
import { ScrambleText } from "@/components/marketing/motion/ScrambleText";
import { MarqueeRow } from "@/components/marketing/motion/MarqueeRow";
import { TimeStamp } from "@/components/skyie/TimeStamp";
import { FreezeMotionToggle } from "@/components/marketing/FreezeMotionToggle";

/**
 * /dev — primitives in isolation. The in-repo replacement for Storybook.
 *
 * Per the build directive: every primitive is exhibited here at multiple
 * sizes / configurations so we can verify behaviour visually without
 * setting up a separate tooling pipeline.
 */

export const metadata = { title: "/dev · primitives", robots: { index: false } };

export default function DevPage() {
  return (
    <main id="main" className="px-[var(--gutter)] py-[clamp(48px,8vh,128px)] flex flex-col gap-[clamp(48px,6vh,96px)]">
      <header className="flex flex-col gap-2">
        <span className="text-mono-sm text-ink/60">/dev · primitives in isolation</span>
        <h1 className="text-h1">Component exhibits</h1>
        <p className="max-w-[60ch] text-ink/70">
          Every reusable primitive at multiple sizes and configurations.
          Used during development to verify motion math and reduced-motion
          fallback in isolation, before composing into pages.
        </p>
      </header>

      {/* DriftMark · sizes */}
      <Section eyebrow="01" title="DriftMark · sizes">
        <div className="flex flex-wrap items-end gap-12">
          {[16, 32, 64, 120, 240, 480].map((s) => (
            <figure key={s} className="flex flex-col items-center gap-3">
              <DriftMark size={s} />
              <figcaption className="text-mono-sm text-ink/50">{s}px</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* DriftMark · variants */}
      <Section eyebrow="02" title="DriftMark · variants">
        <div className="grid gap-12 sm:grid-cols-3">
          <Cell label="full · animated">
            <DriftMark size={200} variant="full" animated />
          </Cell>
          <Cell label="full · static">
            <DriftMark size={200} variant="full" animated={false} />
          </Cell>
          <Cell label="slice · animated">
            <DriftMark size={300} variant="slice" />
          </Cell>
        </div>
      </Section>

      {/* DriftMark · speeds */}
      <Section eyebrow="03" title="DriftMark · speeds">
        <div className="flex flex-wrap items-end gap-12">
          {[1, 2, 4, 8].map((s) => (
            <figure key={s} className="flex flex-col items-center gap-3">
              <DriftMark size={120} speed={s} />
              <figcaption className="text-mono-sm text-ink/50">{s}s</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* DriftMark · pauseOnHover */}
      <Section eyebrow="04" title="DriftMark · pauseOnHover">
        <DriftMark size={200} pauseOnHover />
        <p className="text-mono-sm text-ink/60 mt-3">
          Hover the mark above. The wave should freeze; leave to resume.
        </p>
      </Section>

      {/* TimeStamp */}
      <Section eyebrow="05" title="TimeStamp · live UTC">
        <TimeStamp className="text-h2" />
      </Section>

      {/* Counter */}
      <Section eyebrow="06" title="Counter · scroll-triggered">
        <div className="grid gap-12 sm:grid-cols-3">
          <Cell label="plain">
            <Counter value={4567} className="text-h1" />
          </Cell>
          <Cell label="suffix">
            <Counter value={120} suffix=" fps" className="text-h1" />
          </Cell>
          <Cell label="scramble">
            <Counter value={88412} scramble className="text-h1" />
          </Cell>
        </div>
      </Section>

      {/* ScrambleText */}
      <Section eyebrow="07" title="ScrambleText">
        <div className="flex flex-col gap-6">
          <ScrambleText
            as="h2"
            className="text-h1"
            text="Compose time."
            trigger="mount"
          />
          <ScrambleText
            as="p"
            className="text-mono-sm text-ink/70"
            text="REND-04772-NN · 2026-04-27 · 0840 UTC"
            trigger="mount"
          />
        </div>
      </Section>

      {/* MarqueeRow */}
      <Section eyebrow="08" title="MarqueeRow · ticker">
        <MarqueeRow speed={80} className="border-y border-ink/10 py-3">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="text-mono-sm text-ink/70 whitespace-nowrap">
              24 fps · 30 fps · 60 fps · 120 fps · skyie.studio · {i.toString().padStart(2, "0")}
            </span>
          ))}
        </MarqueeRow>
      </Section>

      {/* MotionPolicy */}
      <Section eyebrow="09" title="Motion policy">
        <div className="flex flex-col gap-3">
          <FreezeMotionToggle />
          <p className="text-mono-sm text-ink/60 max-w-[60ch]">
            Toggle to verify reduced-motion fallback for every primitive
            on this page. Persists across reloads. Resolution order:
            user toggle → URL <code>?reduce-motion=1</code> → system
            <code className="text-mono-sm">prefers-reduced-motion</code>.
          </p>
        </div>
      </Section>
    </main>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6 border-t border-ink/10 pt-10">
      <header className="flex items-baseline gap-4">
        <span className="text-mono-sm text-ink/40">{eyebrow}</span>
        <h2 className="text-h3 text-ink">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col items-start gap-3 border border-ink/10 p-6">
      {children}
      <figcaption className="text-mono-sm text-ink/50">{label}</figcaption>
    </figure>
  );
}
