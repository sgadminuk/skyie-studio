import type { Metadata } from "next";
import { sans, mono } from "./fonts";
import "./globals.css";
import { ToastProvider } from "@/components/toast-provider";
import { AuthClientProvider } from "./auth-client-provider";
import { AuthenticatedLayout } from "./authenticated-layout";
import { MotionPolicyProvider } from "@/components/skyie/MotionPolicyProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.skyie.studio"),
  title: "Skyie Studio",
  description: "AI Video Generation Platform — synthesize motion from a prompt.",
  // The dashboard is auth-walled; nothing to index. robots.ts disallows
  // all crawlers as a defence-in-depth.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10000 focus:bg-paper focus:text-ink focus:px-3 focus:py-2 focus:outline-2 focus:outline-signal"
        >
          Skip to content
        </a>
        <MotionPolicyProvider>
          <AuthClientProvider>
            <AuthenticatedLayout>{children}</AuthenticatedLayout>
            <ToastProvider />
          </AuthClientProvider>
        </MotionPolicyProvider>
      </body>
    </html>
  );
}
