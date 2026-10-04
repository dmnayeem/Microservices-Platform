import {
  SITEMAP_HEADERS,
  isSitemapSection,
  renderUrlset,
  sitemapSection,
} from "@/lib/seo/sitemap-data";

/** /sitemaps/<section>.xml — one section of the sitemap index at /sitemap.xml. */
export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const name = file.replace(/\.xml$/, "");
  if (!file.endsWith(".xml") || !isSitemapSection(name)) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(renderUrlset(await sitemapSection(name)), { headers: SITEMAP_HEADERS });
}
