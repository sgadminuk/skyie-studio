import { AccessForm } from "@/components/access/AccessForm";
import { homeAccessLede } from "@/content/home";

/**
 * §7 Access — the home CTA (per brief §4.1, §7).
 *
 * One sentence. One full-width input. One button. The form is the same
 * Server Action used by /access — on success the input becomes the code's
 * display, button label flips to "Copy".
 */
export function AccessSection() {
  return (
    <section
      aria-labelledby="access-heading"
      id="access"
      className="px-[var(--gutter)] py-[clamp(96px,16vh,240px)] flex flex-col gap-12"
    >
      <header className="flex items-baseline gap-4">
        <span className="text-mono-sm text-ink/40">§07</span>
        <h2 id="access-heading" className="text-h2">
          Access.
        </h2>
      </header>

      <p className="text-h3 text-ink/85 max-w-[42ch]">{homeAccessLede}</p>

      <div className="max-w-[64rem]">
        <AccessForm variant="inline" formLabel="Request studio access from the home page" />
      </div>
    </section>
  );
}
