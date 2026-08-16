/**
 * Renders a JSON-LD structured-data block (schema.org) for SEO / AEO / GEO.
 * Server-safe; drop `<JsonLd data={...} />` into any page. Multiple blocks are
 * fine. Search/answer engines read these for rich results + entity signals.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify is safe here (no user-controlled </script> injection for
      // our own structured objects); values are our own strings/numbers.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
