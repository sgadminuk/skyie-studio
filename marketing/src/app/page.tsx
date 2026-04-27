import { Threshold } from "@/components/sections/Threshold";
import { Hero } from "@/components/sections/Hero";
import { Substrate } from "@/components/sections/Substrate";
import { Specimen } from "@/components/sections/Specimen";
import { Numbers } from "@/components/sections/Numbers";
import { AccessSection } from "@/components/sections/AccessSection";

/**
 * Home · narrative spine.
 *
 * Composition order matches brief §4.1: §0 Threshold (curtain) → §1 Hero
 * → §2 Substrate → §3 Specimen → §6 Numbers → §7 Access.
 *
 * §4 Capabilities and §5 Workshop slot in between §3 and §6 in a later
 * commit — they're the interactive heavy-lifting (§10 step 10).
 */
export default function Home() {
  return (
    <>
      <Threshold />
      <main id="main" className="flex flex-col">
        <Hero />
        <Substrate />
        <Specimen />
        <Numbers />
        <AccessSection />
      </main>
    </>
  );
}
