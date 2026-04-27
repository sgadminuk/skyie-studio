import type { Config } from "tailwindcss";

/**
 * Skyie Studio · Tailwind config.
 *
 * Bridges the channel-only RGB triplets in globals.css to Tailwind's
 * `<alpha-value>` placeholder so utilities like `bg-ink/55` work.
 *
 * Existing shadcn semantic tokens (`background`, `primary`, etc.) are
 * preserved and now resolve to the Skyie palette under the hood — every
 * shadcn primitive picks up the new visuals without code changes.
 */

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink:     "rgb(var(--ink-rgb) / <alpha-value>)",
        paper:   "rgb(var(--paper-rgb) / <alpha-value>)",
        signal:  "rgb(var(--signal-rgb) / <alpha-value>)",
        char:    "rgb(var(--char-rgb) / <alpha-value>)",

        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT:    "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT:    "rgb(var(--popover) / <alpha-value>)",
          foreground: "rgb(var(--popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT:    "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT:    "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT:    "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT:    "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT:    "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        border: "rgb(var(--border) / <alpha-value>)",
        input:  "rgb(var(--input) / <alpha-value>)",
        ring:   "rgb(var(--ring) / <alpha-value>)",
        chart: {
          "1": "rgb(var(--chart-1) / <alpha-value>)",
          "2": "rgb(var(--chart-2) / <alpha-value>)",
          "3": "rgb(var(--chart-3) / <alpha-value>)",
          "4": "rgb(var(--chart-4) / <alpha-value>)",
          "5": "rgb(var(--chart-5) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius))",
        sm: "calc(var(--radius))",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontWeight: {
        body: "380",
      },
      transitionTimingFunction: {
        "out-skyie":  "cubic-bezier(0.16, 1, 0.3, 1)",
        "inout-skyie": "cubic-bezier(0.83, 0, 0.17, 1)",
        "drift":       "cubic-bezier(0.45, 0, 0.55, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
