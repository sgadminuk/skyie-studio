import Link from "next/link";
import { DriftMark } from "@/components/brand/DriftMark";

/**
 * Site header. 24px animated mark left, route nav right. Thin row.
 *
 * The mark is paused under prefers-reduced-motion via the global CSS
 * rule in DriftMark.module.css — no JS needed.
 */
export function Header() {
  return (
    <header
      className="sticky top-0 z-40 border-b border-ink/10 bg-paper/95 backdrop-blur-[2px] supports-[backdrop-filter]:bg-paper/80"
      role="banner"
    >
      <div className="px-[var(--gutter)] py-3 flex items-center justify-between gap-6">
        <Link
          href="/"
          aria-label="Skyie Studio · home"
          className="flex items-center gap-3 text-ink"
          data-cursor="ring"
        >
          <DriftMark size={24} variant="full" speed={4} />
          <span className="text-mono-sm tracking-[0.2em] uppercase hidden sm:inline">
            Skyie&nbsp;Studio
          </span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-6">
          <NavLink href="/system">System</NavLink>
          <NavLink href="/work">Work</NavLink>
          <NavLink href="/access">Access</NavLink>
          <NavLink href="/manifesto">Manifesto</NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-mono-sm uppercase tracking-[0.16em] text-ink/70 hover:text-ink transition-colors"
      data-cursor="ring"
    >
      {children}
    </Link>
  );
}
