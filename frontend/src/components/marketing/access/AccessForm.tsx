"use client";

import { useId, useState, useTransition } from "react";
import { requestAccess, type RequestAccessResult } from "@/app/(marketing)/access/actions";

/**
 * <AccessForm /> — single email input + single button. On submit, the
 * Server Action returns a generated 6-character code; the input field
 * becomes the code's display, and the button label changes to "copy".
 *
 * Per brief §4.1 §7 and §4.4. The code is non-functional — ceremony.
 *
 * Variants:
 *   - "stacked"  — input full width, button below. Used inside plan cards.
 *   - "inline"   — input + button on one line. Used by home §7.
 */

export type AccessFormProps = {
  variant?: "stacked" | "inline";
  /** Pre-fill the hidden plan field. */
  plan?: string;
  /** Override CTA copy. Default "Request access". */
  cta?: string;
  /** Used to differentiate aria-live regions when multiple forms render. */
  formLabel?: string;
};

export function AccessForm({
  variant = "stacked",
  plan,
  cta = "Request access",
  formLabel = "Request studio access",
}: AccessFormProps) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RequestAccessResult | null>(null);
  const [copied, setCopied] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await requestAccess(fd);
      setResult(r);
      setCopied(false);
    });
  }

  async function copy() {
    if (result?.ok) {
      try {
        await navigator.clipboard.writeText(result.code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        /* no-op */
      }
    }
  }

  const succeeded = result?.ok === true;
  const inputRow =
    variant === "inline"
      ? "grid grid-cols-[1fr_auto] gap-3"
      : "flex flex-col gap-3";

  return (
    <form
      onSubmit={onSubmit}
      className={inputRow}
      aria-label={formLabel}
      noValidate
    >
      {plan ? <input type="hidden" name="plan" value={plan} /> : null}

      <label className="sr-only" htmlFor={`${id}-email`}>
        Email address
      </label>
      <input
        id={`${id}-email`}
        type="email"
        name="email"
        required
        autoComplete="email"
        readOnly={succeeded}
        value={succeeded ? result!.code : undefined}
        defaultValue=""
        placeholder={succeeded ? "" : "you@studio.example"}
        aria-invalid={result && !result.ok ? true : undefined}
        aria-describedby={result && !result.ok ? `${id}-error` : undefined}
        className={[
          "w-full bg-transparent border border-ink/30 px-4 py-3",
          "text-[clamp(1rem,0.5vw+0.85rem,1.25rem)] tabular-nums",
          succeeded ? "text-mono-sm uppercase tracking-[0.2em]" : "",
          succeeded ? "text-signal" : "text-ink",
          "placeholder:text-ink/55 placeholder:not-italic focus:outline-2 focus:outline-signal focus:outline-offset-4",
          "transition-colors",
        ].join(" ")}
      />

      <button
        type={succeeded ? "button" : "submit"}
        onClick={succeeded ? copy : undefined}
        disabled={pending}
        className={[
          "px-6 py-3 cursor-pointer",
          "text-mono-sm uppercase tracking-[0.16em]",
          "border border-ink hover:bg-ink hover:text-paper transition-colors",
          succeeded ? "bg-ink text-paper" : "bg-transparent text-ink",
          "disabled:opacity-50",
          variant === "inline" ? "whitespace-nowrap" : "",
        ].join(" ")}
        data-cursor="ring"
      >
        {pending
          ? "Submitting…"
          : succeeded
            ? copied
              ? "Copied"
              : "Copy"
            : cta}
      </button>

      <div className="col-span-full text-mono-sm" role="status" aria-live="polite">
        {result?.ok === false ? (
          <span id={`${id}-error`} className="text-signal">
            Email isn’t recognised. Re-enter and submit again.
          </span>
        ) : succeeded ? (
          <span className="text-ink/55">
            Code recorded. The studio will reach out to {`<${maskEmail()}>`} when capacity opens.
          </span>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Tiny helper — we don't want to round-trip the email back from the
 * server action just to mask it. The placeholder copy is fine.
 */
function maskEmail(): string {
  return "the address you provided";
}
