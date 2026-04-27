import type { MetadataRoute } from "next";

/**
 * The dashboard is auth-walled — there's nothing for crawlers to see.
 * Defence-in-depth: explicit Disallow at the robots level *and* the
 * `robots: { index: false }` directive in the root layout's metadata.
 *
 * The marketing site at https://skyie.studio is the public surface and
 * has its own sitemap + permissive robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
