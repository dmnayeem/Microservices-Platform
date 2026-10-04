import {
  SITEMAP_HEADERS,
  SITEMAP_SECTIONS,
  renderIndex,
  sitemapSection,
  sitemapSectionUrl,
} from "@/lib/seo/sitemap-data";

/**
 * /sitemap.xml — the index Search Console was given. It lists one sitemap per
 * section (src/lib/seo/sitemap-data.ts), so each one's page count and indexed
 * count show separately. A section with nothing in it is left out.
 */
export const revalidate = 3600;

export async function GET() {
  const sections = await Promise.all(
    SITEMAP_SECTIONS.map(async (s) => {
      const entries = await sitemapSection(s);
      const times = entries
        .map((e) => e.lastModified?.getTime() ?? NaN)
        .filter((t) => !Number.isNaN(t));
      return {
        loc: sitemapSectionUrl(s),
        count: entries.length,
        lastModified: times.length ? new Date(Math.max(...times)) : undefined,
      };
    })
  );
  return new Response(renderIndex(sections.filter((s) => s.count > 0)), {
    headers: SITEMAP_HEADERS,
  });
}
