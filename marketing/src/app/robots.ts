import type { MetadataRoute } from "next";

/**
 * Generates /robots.txt at build time.
 *
 * /dev is the in-repo primitive exhibit (per the build directive), not
 * for public indexing. Everything else is fair game.
 */

const BASE = "https://skyie.studio";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dev", "/api/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
