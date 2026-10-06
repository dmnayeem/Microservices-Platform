/**
 * Split a pasted network snippet into the `<script>` tags it contains, so a
 * PAGE_SCRIPT ad can be injected through `next/script` instead of raw HTML.
 *
 * Network page-level tags (popunder, social bar, in-page push, vignette) are
 * almost always one or two `<script>` elements: an external `src`, an inline
 * bootstrap, or both. Anything else in the snippet (a `<div>` placeholder,
 * comments) is ignored — a page-level script has no slot to render into.
 *
 * Client-safe, no imports.
 */
export interface SnippetScript {
  /** Absolute https URL, when the tag is external. */
  src?: string;
  /** Inline body, when the tag is inline. */
  inline?: string;
  /** `data-*`, `async`, `type` etc. — passed through (event handlers dropped). */
  attrs: Record<string, string>;
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    // Never carry an inline event handler through; nothing legitimate needs one.
    if (name.startsWith("on")) continue;
    out[name] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

function absoluteSrc(src: string): string | undefined {
  const s = src.trim();
  const abs = s.startsWith("//") ? `https:${s}` : s;
  try {
    const u = new URL(abs);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    // Upgrade: the page is https, a mixed-content script would be blocked anyway.
    u.protocol = "https:";
    return u.toString();
  } catch {
    return undefined;
  }
}

export function parseSnippetScripts(html: string | null | undefined): SnippetScript[] {
  if (!html) return [];
  const out: SnippetScript[] = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    const attrs = parseAttrs(m[1] ?? "");
    const type = (attrs.type ?? "").toLowerCase();
    // JSON / template blocks are data, not code.
    if (type && !/(javascript|module|^text\/javascript$)/.test(type)) continue;
    const body = (m[2] ?? "").trim();
    if (attrs.src) {
      const src = absoluteSrc(attrs.src);
      if (!src) continue;
      delete attrs.src;
      out.push({ src, attrs });
    } else if (body) {
      out.push({ inline: body, attrs });
    }
    if (out.length >= 8) break;
  }
  return out;
}

/** Hostnames a snippet loads scripts / frames from (for the per-frame CSP). */
export function snippetHosts(html: string | null | undefined): string[] {
  if (!html) return [];
  const hosts = new Set<string>();
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']?((?:https?:)?\/\/[^"'\s>]+)/gi)) {
    try {
      const raw = m[1].startsWith("//") ? `https:${m[1]}` : m[1];
      hosts.add(new URL(raw).host);
    } catch {
      /* ignore */
    }
  }
  return [...hosts].slice(0, 20);
}
