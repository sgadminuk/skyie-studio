import { Threshold } from "@/components/marketing/sections/Threshold";
import { Hero } from "@/components/marketing/sections/Hero";
import { Substrate } from "@/components/marketing/sections/Substrate";
import { Specimen } from "@/components/marketing/sections/Specimen";
import { Capabilities } from "@/components/marketing/sections/Capabilities";
import { Workshop } from "@/components/marketing/sections/Workshop";
import { Numbers } from "@/components/marketing/sections/Numbers";
import { AccessSection } from "@/components/marketing/sections/AccessSection";

/**
 * Home · all eight sections, composed in the order brief §4.1 requires.
 *
 *   §0 Threshold → §1 Hero → §2 Substrate → §3 Specimen →
 *   §4 Capabilities → §5 Workshop → §6 Numbers → §7 Access.
 *
 * GSAP ScrollTrigger pinning per the DECISIONS.md table is wired in a
 * follow-up commit; the sections work without it (each manages its own
 * scroll-driven state via rAF / IntersectionObserver).
 */
export default function Home() {
  return (
    <>
      <Threshold />
      <main id="main" className="flex flex-col">
        <Hero />
        <Substrate />
        <Specimen />
        <Capabilities />
        <Workshop />
        <Numbers />
        <AccessSection />
      </main>
    </>
  );
}
