import type { Metadata } from "next";
import { DriftMark } from "@/components/brand/DriftMark";
import { AccessForm } from "@/components/access/AccessForm";
import { accessLede, accessPlans, type AccessPlan } from "@/content/access";

export const metadata: Metadata = {
  title: "Access",
  description:
    "Three configurations of the same workshop. Request access to Skyie Studio.",
};

/**
 * /access — pricing and access request (per brief §4.4).
 *
 * Three plans, one column each. Pricing in mono. No "Most Popular" badge.
 * Middle plan inverts to ink on hover. All three CTAs route through the
 * same Server Action (requestAccess) and produce a 6-character code.
 */
export default function AccessPage() {
  return (
    <main
      id="main"
      className="px-[var(--gutter)] pb-[clamp(96px,12vh,192px)] pt-[clamp(48px,8vh,128px)] flex flex-col gap-[clamp(48px,7vh,112px)]"
    >
      <header className="mx-auto w-full max-w-[78rem] flex flex-col gap-6">
        <span className="text-mono-sm text-ink/50">Access · 2026</span>
        <h1 className="text-display max-w-[12ch]">Three configurations.</h1>
        <p className="text-h3 text-ink/80 leading-snug max-w-[62ch]">{accessLede}</p>
      </header>

      <section
        aria-labelledby="plans-heading"
        className="mx-auto w-full max-w-[88rem] grid grid-cols-1 lg:grid-cols-3 gap-[1px] bg-ink/15"
      >
        <h2 id="plans-heading" className="sr-only">
          Plans
        </h2>
        {accessPlans.map((plan, i) => (
          <PlanCard key={plan.id} plan={plan} accent={i === 1} />
        ))}
      </section>

      <footer className="mx-auto w-full max-w-[62ch] flex flex-col gap-4 text-mono-sm text-ink/55 border-t border-ink/15 pt-10">
        <DriftMark variant="slice" size="100%" speed={6} className="text-ink/25 h-1.5" />
        <p>
          Codes generated on this page are placeholders for review by the
          studio. They do not unlock anything until a member of the studio
          confirms allocation.
        </p>
        <p>
          For technical correspondence: <a href="mailto:hello@skyie.studio" className="text-ink hover:text-signal">hello@skyie.studio</a>.
        </p>
      </footer>
    </main>
  );
}

function PlanCard({ plan, accent }: { plan: AccessPlan; accent: boolean }) {
  return (
    <article
      className={[
        "group relative bg-paper p-[clamp(24px,2.4vw,40px)] flex flex-col gap-8 min-h-[640px]",
        accent ? "lg:hover:bg-ink lg:hover:text-paper transition-colors" : "",
      ].join(" ")}
      aria-labelledby={`plan-${plan.id}-name`}
    >
      <header className="flex items-baseline justify-between">
        <span className="text-mono-sm opacity-60">{plan.numeral}</span>
        <span
          className={[
            "text-mono-sm tracking-[0.2em] uppercase",
            accent ? "lg:group-hover:text-paper" : "",
          ].join(" ")}
        >
          {plan.name}
        </span>
      </header>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[clamp(2.5rem,3.5vw+1rem,5.5rem)] leading-[0.9] tracking-tight tabular-nums">
          {formatPrice(plan)}
        </span>
        <span className="text-mono-sm opacity-55">per month · {plan.currency}</span>
      </div>

      <p
        id={`plan-${plan.id}-name`}
        className="text-[clamp(1rem,0.4vw+0.9rem,1.25rem)] leading-[1.5] opacity-90"
      >
        {plan.description}
      </p>

      <ul className="flex flex-col gap-3 list-none pl-0 text-[0.9375rem] leading-[1.5] flex-1">
        {plan.inclusions.map((line) => (
          <li key={line} className="flex gap-3 items-start">
            <span className="text-mono-sm mt-1 opacity-50" aria-hidden>
              ·
            </span>
            <span className="opacity-80">{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        <AccessForm
          plan={plan.id}
          cta={plan.cta}
          formLabel={`Request access to the ${plan.name} plan`}
        />
      </div>
    </article>
  );
}

function formatPrice(plan: AccessPlan): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: plan.currency,
    maximumFractionDigits: 0,
  }).format(plan.priceMonthly);
}
