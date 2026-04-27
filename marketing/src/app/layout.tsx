import type { Metadata, Viewport } from "next";
import { sans, mono } from "./fonts";
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
      <body className="min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
