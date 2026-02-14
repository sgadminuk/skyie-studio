import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/toast-provider";
import { AuthClientProvider } from "./auth-client-provider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Skyie Studio",
  description: "AI Video Generation Platform — Create professional videos with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthClientProvider>
          <AppShell>{children}</AppShell>
          <ToastProvider />
        </AuthClientProvider>
      </body>
    </html>
  );
}
