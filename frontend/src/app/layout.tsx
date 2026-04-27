import type { Metadata } from "next";
import { sans, mono } from "./fonts";
import "./globals.css";
import { ToastProvider } from "@/components/toast-provider";
import { AuthClientProvider } from "./auth-client-provider";
import { MotionPolicyProvider } from "@/components/skyie/MotionPolicyProvider";

/**
 * Root layout. Unbiased — works for both the marketing apex and the
 * authenticated dashboard. Each route group decides its own chrome:
 *
 *   - app/(marketing)/layout.tsx   → marketing Header + Footer + cursor
 *   - app/dashboard/layout.tsx     → AppShell with auth guard + sidebar
 *
 * Top-level providers (auth, motion policy, toasts) live here so they
 * span both surfaces. The login / register routes inherit this layout
 * directly (no chrome — see those pages for their own shell).
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://skyie.studio"),
  title: {
    default: "Skyie Studio",
    template: "%s · Skyie Studio",
  },
  description: "AI Video Generation Platform — synthesize motion from a prompt.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[10000] focus:bg-paper focus:text-ink focus:px-3 focus:py-2 focus:outline-2 focus:outline-signal"
        >
          Skip to content
        </a>
        <MotionPolicyProvider>
          <AuthClientProvider>
            {children}
            <ToastProvider />
          </AuthClientProvider>
        </MotionPolicyProvider>
      </body>
    </html>
  );
}
