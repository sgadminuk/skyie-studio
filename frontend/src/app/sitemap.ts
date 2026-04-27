import type { MetadataRoute } from "next";

/**
 * Generates /sitemap.xml at build time.
 *
 * Five public routes per brief §4. /dev is internal — robots.txt
 * disallows it; sitemap omits it.
 */

const BASE = "https://skyie.studio";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-04-27");
  return [
    { url: `${BASE}/`,          lastModified, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/system`,    lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/work`,      lastModified, changeFrequency: "weekly",  priority: 0.9 },
    { url: `${BASE}/access`,    lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/manifesto`, lastModified, changeFrequency: "yearly",  priority: 0.6 },
  ];
}
