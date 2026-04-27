"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import api from "@/lib/api";
import { DriftMark } from "@/components/skyie/DriftMark";
import { TimeStamp } from "@/components/skyie/TimeStamp";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const { loginWithOtp } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.post("/auth/otp/request", { email });
      toast.success("Login code sent to your email");
      setStep("code");
      setCountdown(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to send code";
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCodeChange(index: number, value: string) {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (value && index === 5) {
      const fullCode = newCode.join("");
      if (fullCode.length === 6) handleVerifyOtp(fullCode);
    }
  }

  function handleCodeKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newCode = [...code];
    for (let i = 0; i < pasted.length; i++) newCode[i] = pasted[i];
    setCode(newCode);
    if (pasted.length === 6) handleVerifyOtp(pasted);
    else inputRefs.current[pasted.length]?.focus();
  }

  async function handleVerifyOtp(fullCode?: string) {
    const otpCode = fullCode || code.join("");
    if (otpCode.length !== 6 || submitting) return;
    setSubmitting(true);
    try {
      await loginWithOtp(email, otpCode);
      toast.success("Welcome to Skyie Studio");
      router.push("/");
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Invalid code";
      toast.error(detail);
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (countdown > 0 || submitting) return;
    setSubmitting(true);
    try {
      await api.post("/auth/otp/request", { email });
      toast.success("New code sent");
      setCountdown(60);
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch {
      toast.error("Failed to resend code");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      {/* Header strip */}
      <header className="flex items-center justify-between px-[var(--gutter)] py-5 border-b border-ink/15">
        <Link href="/" className="flex items-center gap-3" aria-label="Skyie Studio · home">
          <DriftMark size={24} variant="full" speed={4} className="text-ink" />
          <span className="text-mono-sm tracking-[0.22em]">SKYIE STUDIO</span>
        </Link>
        <div className="hidden sm:flex items-center gap-6 text-mono-sm text-ink/55">
          <span>UTC</span>
          <TimeStamp className="text-ink" />
        </div>
      </header>

      {/* Main grid */}
      <main className="flex-1 grid grid-cols-12 gap-x-[var(--gutter)] px-[var(--gutter)] py-[clamp(40px,8vh,96px)]">
        {/* Big Drift mark · cols 1-7 (lg) — decorative, scaled massive */}
        <div className="col-span-12 lg:col-span-7 flex items-center justify-center mb-12 lg:mb-0">
          <DriftMark
            variant="full"
            size="100%"
            speed={5}
            style={{ height: "clamp(160px, 32vh, 480px)", width: "auto" }}
          />
        </div>

        {/* Form · cols 8-12 (lg) */}
        <div className="col-span-12 lg:col-span-5 lg:col-start-8 flex flex-col gap-8 max-w-[26rem] lg:mt-12">
          <div className="flex flex-col gap-3">
            <span className="text-mono-sm text-ink/40">
              {step === "email" ? "ACCESS · 01 / 02" : "ACCESS · 02 / 02"}
            </span>
            <h1 className="text-h2">
              {step === "email" ? "Sign in." : "Enter the code."}
            </h1>
            <p className="text-ink/70 max-w-[36ch]">
              {step === "email"
                ? "We send a six-character code to your address. No password to remember."
                : `Code sent to ${email}. Six digits, expires in two minutes.`}
            </p>
          </div>

          {step === "email" ? (
            <form onSubmit={handleRequestOtp} className="flex flex-col gap-4">
              <label htmlFor="email" className="flex flex-col gap-2">
                <span className="text-mono-sm text-ink/55">EMAIL</span>
                <input
                  id="email"
                  type="email"
                  placeholder="you@studio.example"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  className="bg-transparent border border-ink/30 px-4 py-3 text-ink placeholder:text-ink/45 focus:outline-2 focus:outline-signal focus:outline-offset-4 transition-colors"
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center justify-center gap-2 border border-ink bg-ink text-paper px-6 py-3 text-mono-sm tracking-[0.18em] uppercase transition-colors hover:bg-paper hover:text-ink disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending code
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Send login code
                  </>
                )}
              </button>
              <p className="text-mono-sm text-ink/45">
                No account?{" "}
                <Link href="/register" className="text-signal hover:underline">
                  Request access
                </Link>
              </p>
            </form>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex justify-between gap-2" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    autoFocus={i === 0}
                    className={cn(
                      "h-14 w-12 text-center text-2xl tabular-nums font-mono",
                      "bg-transparent border border-ink/30 text-ink",
                      "focus:outline-2 focus:outline-signal focus:outline-offset-4",
                    )}
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleVerifyOtp()}
                disabled={code.join("").length !== 6 || submitting}
                className="flex items-center justify-center gap-2 border border-ink bg-ink text-paper px-6 py-3 text-mono-sm tracking-[0.18em] uppercase transition-colors hover:bg-paper hover:text-ink disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying
                  </>
                ) : (
                  "Verify & Sign in"
                )}
              </button>

              <div className="flex items-center justify-between text-mono-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode(["", "", "", "", "", ""]);
                  }}
                  className="flex items-center gap-1 text-ink/60 hover:text-ink"
                >
                  <ArrowLeft className="h-3 w-3" /> Change email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={countdown > 0}
                  className={cn(
                    countdown > 0 ? "text-ink/40" : "text-signal hover:underline",
                  )}
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-ink/15 px-[var(--gutter)] py-4 flex items-center justify-between text-mono-sm text-ink/45">
        <span>© 2026 Skyie Studio</span>
        <span>Rochester / SF</span>
      </footer>
    </div>
  );
}
