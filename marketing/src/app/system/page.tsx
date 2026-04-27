import type { Metadata } from "next";
import {
  PromptToLatent,
  LatentToFrame,
  FrameToSequence,
  SequenceToOutput,
} from "@/components/system-page/PromptToLatent";

export const metadata: Metadata = {
  title: "System",
  description:
    "How the Skyie Studio platform synthesises video. Four panels, four working interactive demos.",
};

/**
 * /system — live, scrollable explainer (per brief §4.2).
 *
 * Four panels. Each is a real interactive component, not a video, not a
 * static diagram. Topics: Prompt → Latent, Latent → Frame, Frame →
 * Sequence, Sequence → Output.
 */
export default function SystemPage() {
  return (
    <main
      id="main"
      className="px-[var(--gutter)] pb-[clamp(96px,12vh,192px)] pt-[clamp(48px,8vh,128px)]"
    >
      <header className="mx-auto w-full max-w-[78rem] flex flex-col gap-4 mb-16">
        <span className="text-mono-sm text-ink/50">System · 2026</span>
        <h1 className="text-h1 max-w-[14ch]" style={{ textWrap: "balance" }}>
          How it works.
        </h1>
        <p className="text-h3 text-ink/80 max-w-[62ch]">
          Four working panels. Manipulate each one. Each panel resolves
          one step of the pipeline from a written prompt to a published
          file.
        </p>
      </header>

      <article className="mx-auto w-full max-w-[78rem] flex flex-col">
        <PromptToLatent />
        <LatentToFrame />
        <FrameToSequence />
        <SequenceToOutput />
      </article>
    </main>
  );
}
