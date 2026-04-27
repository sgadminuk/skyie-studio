import type { Metadata, Viewport } from "next";
import { sans, mono } from "./fonts";
import { Providers } from "@/components/system/Providers";
import { Header } from "@/components/system/Header";
import { Footer } from "@/components/system/Footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://skyie.studio"),
  title: {
    default: "Skyie Studio · synthesizing motion",
    template: "%s · Skyie Studio",
  },
  description:
    "Skyie Studio renders 24-, 30-, 60-, and 120-frame-per-second video from a single prompt. A workshop for synthesizing motion.",
  applicationName: "Skyie Studio",
  authors: [{ name: "Skyie Studio" }],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en",
    url: "https://skyie.studio",
    title: "Skyie Studio",
    description: "A workshop for synthesizing motion.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F2EC" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen flex flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[10000] focus:bg-paper focus:text-ink focus:px-3 focus:py-2 focus:outline-2 focus:outline-signal">
          Skip to content
        </a>
        <Providers>
          <Header />
          <div className="flex-1 flex flex-col">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
