/**
 * Home · placeholder.
 *
 * The real home (eight choreographed sections, per brief §4.1) is built
 * out section-by-section in a later phase. Until then, this renders
 * nothing but the bare token palette so we can verify the build pipeline.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-[var(--gutter)]">
      <p className="text-mono-sm text-ink/60">
        skyie.studio · construction in progress
      </p>
    </main>
  );
}
