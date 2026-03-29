"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Video, ArrowLeft, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import api from "@/lib/api";

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

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (value && index === 5) {
      const fullCode = newCode.join("");
      if (fullCode.length === 6) {
        handleVerifyOtp(fullCode);
      }
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
    for (let i = 0; i < pasted.length; i++) {
      newCode[i] = pasted[i];
    }
    setCode(newCode);
    if (pasted.length === 6) {
      handleVerifyOtp(pasted);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  }

  async function handleVerifyOtp(fullCode?: string) {
    const otpCode = fullCode || code.join("");
    if (otpCode.length !== 6 || submitting) return;

    setSubmitting(true);
    try {
      await loginWithOtp(email, otpCode);
      toast.success("Welcome to Skyie Studio!");
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Video className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">
            {step === "email" ? "Sign in to Skyie Studio" : "Enter your code"}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {step === "email"
              ? "We'll send a login code to your email"
              : `Code sent to ${email}`}
          </p>
        </CardHeader>
        <CardContent>
          {step === "email" ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="hello@skyieglobal.co.uk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending code...</>
                ) : (
                  <><Mail className="mr-2 h-4 w-4" />Send login code</>
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-6">
              {/* OTP Code Input */}
              <div className="flex justify-center gap-2" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <Input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    className="w-12 h-14 text-center text-2xl font-mono font-bold"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {/* Verify Button */}
              <Button
                className="w-full"
                onClick={() => handleVerifyOtp()}
                disabled={code.join("").length !== 6 || submitting}
              >
                {submitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</>
                ) : (
                  "Verify & Sign in"
                )}
              </Button>

              {/* Resend / Back */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => { setStep("email"); setCode(["", "", "", "", "", ""]); }}
                >
                  <ArrowLeft className="h-3 w-3" /> Change email
                </button>
                <button
                  type="button"
                  className={`text-sm ${countdown > 0 ? "text-muted-foreground" : "text-primary hover:underline"}`}
                  onClick={handleResend}
                  disabled={countdown > 0}
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
