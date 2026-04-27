import localFont from "next/font/local";

/**
 * Two faces. Variable axis only. Self-hosted from /public/fonts.
 * No third-party CDN — see brief §3.3 and §11 (acceptance).
 */

export const sans = localFont({
  src: [
    {
      path: "../../public/fonts/InterVariable.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../../public/fonts/InterVariable-Italic.woff2",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-sans",
  display: "swap",
  preload: true,
});

export const mono = localFont({
  src: [
    {
      path: "../../public/fonts/JetBrainsMono-Variable.woff2",
      weight: "100 800",
      style: "normal",
    },
    {
      path: "../../public/fonts/JetBrainsMono-Italic-Variable.woff2",
      weight: "100 800",
      style: "italic",
    },
  ],
  variable: "--font-mono",
  display: "swap",
  preload: false, // mono is used for captions/UI chrome — no above-the-fold body text
});
