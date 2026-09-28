/**
 * Renders a JSON-LD structured-data block (schema.org) for SEO / AEO / GEO.
 * Server-safe; drop `<JsonLd data={...} />` into any page. Multiple blocks are
 * fine. Search/answer engines read these for rich results + entity signals.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // Pages feed user text in here (course titles, listing names, profile
      // names), so a "</script>" in one would end this tag and run whatever
      // followed. Escaping "<" keeps the JSON identical to a parser.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
