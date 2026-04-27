import type { Metadata } from "next";
import { DriftMark } from "@/components/brand/DriftMark";
import {
  manifestoFootnotes,
  manifestoLede,
  manifestoSections,
  type ManifestoNode,
} from "@/content/manifesto";

export const metadata: Metadata = {
  title: "Manifesto",
  description:
    "Skyie Studio is in-house apparatus. A workshop for synthesizing motion.",
};

/**
 * /manifesto — long-form brand statement (per brief §4.5).
 *
 * Single column, max 62ch. Body type set generously. Drift slice as
 * section divider. Numbered footnotes resolve to anchors at the bottom.
 * Asides float in the right margin at desktop, become italic insets on
 * mobile via container queries.
 */
export default function ManifestoPage() {
  return (
    <main
      id="main"
      className="px-[var(--gutter)] pb-[clamp(96px,12vh,192px)] pt-[clamp(48px,8vh,128px)]"
    >
      <article className="mx-auto flex max-w-[78rem] flex-col gap-[clamp(48px,7vh,112px)]">
        <header className="mx-auto w-full max-w-[62ch] flex flex-col gap-6">
          <span className="text-mono-sm text-ink/50">Manifesto · 2026</span>
          <h1 className="text-display">A workshop for synthesizing motion.</h1>
          <p className="text-h3 text-ink/80 leading-snug">{manifestoLede}</p>
        </header>

        {manifestoSections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="@container relative grid grid-cols-[1fr] gap-x-[var(--gutter)] gap-y-8 lg:grid-cols-[minmax(0,62ch)_minmax(0,1fr)] lg:gap-x-[clamp(32px,6vw,96px)]"
          >
            <div className="lg:col-start-1 lg:col-end-2 lg:row-start-1 mx-auto w-full max-w-[62ch] lg:mx-0">
              {/* Drift slice — 1px tall (per brief §4.5, §5.1) */}
              <div
                className="text-ink/30 mb-10 overflow-hidden"
                style={{ height: 6 }}
                aria-hidden
              >
                <DriftMark variant="slice" size="100%" speed={6} />
              </div>

              <header className="flex items-baseline gap-6 mb-6">
                <span className="text-mono-sm text-ink/40">{section.numeral}</span>
                <h2 className="text-h2">{section.heading}</h2>
              </header>

              <div className="flex flex-col gap-5 [&_p]:text-[clamp(1.0625rem,0.4vw+0.95rem,1.5rem)] [&_p]:leading-[1.55] [&_p]:text-ink/85">
                {section.body.map((para, i) => (
                  <p key={i}>{para.map(renderNode)}</p>
                ))}
              </div>
            </div>

            {section.aside ? (
              <aside
                className="text-mono-sm text-ink/60 max-w-[42ch] mx-auto w-full lg:mx-0 lg:col-start-2 lg:col-end-3 lg:row-start-1 lg:pt-24 italic lg:not-italic"
              >
                {section.aside}
              </aside>
            ) : null}
          </section>
        ))}

        {/* Footnotes */}
        <section className="mx-auto w-full max-w-[62ch] flex flex-col gap-6 border-t border-ink/15 pt-10">
          <h2 className="text-mono-sm text-ink/40">Footnotes</h2>
          <ol className="flex flex-col gap-3 list-none pl-0">
            {manifestoFootnotes.map((fn) => (
              <li key={fn.n} id={`fn-${fn.n}`} className="text-ink/75 text-[0.9375rem] leading-[1.55]">
                <a
                  href={`#fnref-${fn.n}`}
                  className="text-mono-sm text-ink mr-3 align-top"
                  aria-label={`Back to reference ${fn.n}`}
                >
                  ({fn.n})
                </a>
                {fn.text}
              </li>
            ))}
          </ol>
        </section>
      </article>
    </main>
  );
}

function renderNode(node: ManifestoNode, i: number): React.ReactNode {
  if (typeof node === "string") return <span key={i}>{node}</span>;
  return (
    <sup key={i} id={`fnref-${node.fn}`} className="ml-0.5">
      <a href={`#fn-${node.fn}`} className="text-mono-sm text-ink hover:text-signal">
        ({node.fn})
      </a>
    </sup>
  );
}
