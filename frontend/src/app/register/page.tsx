"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { DriftMark } from "@/components/skyie/DriftMark";
import { TimeStamp } from "@/components/skyie/TimeStamp";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim() || submitting) return;

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await register(email, password, name);
      toast.success("Account created successfully");
      router.push("/");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Registration failed. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <header className="flex items-center justify-between px-(--gutter) py-5 border-b border-ink/15">
        <Link href="/" className="flex items-center gap-3" aria-label="Skyie Studio · home">
          <DriftMark size={24} variant="full" speed={4} className="text-ink" />
          <span className="text-mono-sm tracking-[0.22em]">SKYIE STUDIO</span>
        </Link>
        <div className="hidden sm:flex items-center gap-6 text-mono-sm text-ink/55">
          <span>UTC</span>
          <TimeStamp className="text-ink" />
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-x-(--gutter) px-(--gutter) py-[clamp(40px,8vh,96px)]">
        <div className="col-span-12 lg:col-span-7 flex items-center justify-center mb-12 lg:mb-0">
          <DriftMark
            variant="full"
            size="100%"
            speed={5}
            style={{ height: "clamp(160px, 32vh, 480px)", width: "auto" }}
          />
        </div>

        <div className="col-span-12 lg:col-span-5 lg:col-start-8 flex flex-col gap-8 max-w-104 lg:mt-12">
          <div className="flex flex-col gap-3">
            <span className="text-mono-sm text-ink/40">REGISTER · 01 / 01</span>
            <h1 className="text-h2">Request access.</h1>
            <p className="text-ink/70 max-w-[36ch]">
              Create an account. The studio reviews each request manually.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field id="name" label="NAME">
              <input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="bg-transparent border border-ink/30 px-4 py-3 text-ink placeholder:text-ink/45 focus:outline-2 focus:outline-signal focus:outline-offset-4"
              />
            </Field>
            <Field id="email" label="EMAIL">
              <input
                id="email"
                type="email"
                placeholder="you@studio.example"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="bg-transparent border border-ink/30 px-4 py-3 text-ink placeholder:text-ink/45 focus:outline-2 focus:outline-signal focus:outline-offset-4"
              />
            </Field>
            <Field id="password" label="PASSWORD">
              <input
                id="password"
                type="password"
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="bg-transparent border border-ink/30 px-4 py-3 text-ink placeholder:text-ink/45 focus:outline-2 focus:outline-signal focus:outline-offset-4"
              />
            </Field>
            <Field id="confirmPassword" label="CONFIRM PASSWORD">
              <input
                id="confirmPassword"
                type="password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="bg-transparent border border-ink/30 px-4 py-3 text-ink placeholder:text-ink/45 focus:outline-2 focus:outline-signal focus:outline-offset-4"
              />
            </Field>

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center justify-center gap-2 border border-ink bg-ink text-paper px-6 py-3 text-mono-sm tracking-[0.18em] uppercase transition-colors hover:bg-paper hover:text-ink disabled:opacity-50 cursor-pointer mt-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account
                </>
              ) : (
                "Request access"
              )}
            </button>

            <p className="text-mono-sm text-ink/45">
              Existing account?{" "}
              <Link href="/login" className="text-signal hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </main>

      <footer className="border-t border-ink/15 px-(--gutter) py-4 flex items-center justify-between text-mono-sm text-ink/45">
        <span>© 2026 Skyie Studio</span>
        <span>Rochester / SF</span>
      </footer>
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-2">
      <span className="text-mono-sm text-ink/55">{label}</span>
      {children}
    </label>
  );
}
