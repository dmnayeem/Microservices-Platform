import { absUrl } from "@/lib/seo/site-url";

/**
 * BreadcrumbList JSON-LD for a nested public page. Pass the trail after
 * "Home", e.g. [{ name: "Features", path: "/features/marketplace" }, …].
 * Google shows it in place of the raw URL; AI engines read it as the page's
 * place in the site.
 */
export function breadcrumbLd(trail: Array<{ name: string; path: string }>): Record<string, unknown> {
  const items = [{ name: "Home", path: "/" }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absUrl(c.path),
    })),
  };
}
