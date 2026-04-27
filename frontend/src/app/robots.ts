import type { MetadataRoute } from "next";

/**
 * Generates /robots.txt at build time.
 *
 * Served on both hosts via the unified Next process. The dashboard
 * (/dashboard/*) and the in-repo primitive exhibit (/dev) should not
 * be indexed on the marketing apex; the (marketing) routes are fair
 * game.
 */

const BASE = "https://skyie.studio";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dev", "/dashboard", "/login", "/register", "/api/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
