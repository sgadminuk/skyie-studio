import localFont from "next/font/local";

/**
 * Inter Variable + JetBrains Mono Variable, mirroring marketing/.
 * Self-hosted from /public/fonts. Variable axis only — no static
 * weights ship.
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
  preload: false,
});
