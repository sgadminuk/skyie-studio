import Link from "next/link";
import { DriftMark } from "@/components/brand/DriftMark";
import { FreezeMotionToggle } from "./FreezeMotionToggle";
import { TimeStamp } from "./TimeStamp";

/**
 * Site footer. Per brief §3.1, the mark is full-width and the dots
 * become page anchors. We render the slice variant at full width — the
 * nine columns line up with the four nav clusters across the row, so
 * the dot-as-anchor metaphor reads.
 */
export function Footer() {
  return (
    <footer
      className="mt-auto border-t border-ink/10 px-[var(--gutter)] py-12 flex flex-col gap-12"
      role="contentinfo"
    >
      {/* Slice across the full row — visual heading for the footer itself */}
      <div className="text-ink/30 overflow-hidden" style={{ height: 14 }} aria-hidden>
        <DriftMark variant="slice" size="100%" speed={8} />
      </div>

      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <FooterCol title="Routes">
          <Link href="/" className="text-mono-sm text-ink/70 hover:text-ink">
            Home
          </Link>
          <Link href="/system" className="text-mono-sm text-ink/70 hover:text-ink">
            System
          </Link>
          <Link href="/work" className="text-mono-sm text-ink/70 hover:text-ink">
            Work
          </Link>
          <Link href="/access" className="text-mono-sm text-ink/70 hover:text-ink">
            Access
          </Link>
          <Link href="/manifesto" className="text-mono-sm text-ink/70 hover:text-ink">
            Manifesto
          </Link>
        </FooterCol>

        <FooterCol title="Studio">
          <p className="text-mono-sm text-ink/65 leading-[1.6]">
            Rochester, NY <br />
            San Francisco, CA <br />
            est. 2026
          </p>
          <a
            href="mailto:hello@skyie.studio"
            className="text-mono-sm text-ink/70 hover:text-ink"
          >
            hello@skyie.studio
          </a>
        </FooterCol>

        <FooterCol title="Telemetry">
          <div className="flex flex-col gap-1">
            <span className="text-mono-sm text-ink/45">UTC</span>
            <TimeStamp />
          </div>
        </FooterCol>

        <FooterCol title="Motion">
          <FreezeMotionToggle />
          <p className="text-mono-sm text-ink/55 max-w-[28ch]">
            Persists across visits. Honours system preference if not set.
          </p>
        </FooterCol>
      </div>

      <p className="text-mono-sm text-ink/45">
        © 2026 Skyie Studio. The mark, the typeface set, and the published
        clips are property of Skyie Studio. Type set in Inter and
        JetBrains Mono. See LICENSES.md.
      </p>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-mono-sm text-ink/40">{title}</span>
      {children}
    </div>
  );
}
