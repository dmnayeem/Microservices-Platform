/**
 * Turns a pasted HTML snippet ("put this in your <head>") into tags React can
 * render. Pasting raw HTML into a React page does NOT run its <script> tags —
 * they have to be real script elements — so the snippet is parsed into the tag
 * types such snippets use: <script>, <meta>, <link>, <style>, <noscript>.
 * Anything else is ignored (and listed back to the admin). Client-safe.
 */
export type CodeTag = {
  tag: "script" | "meta" | "link" | "style" | "noscript";
  attrs: Record<string, string | true>;
  content: string;
};

const TAG_RE = /<(script|style|noscript)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<(meta|link)\b([^>]*?)\/?>/gi;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(raw: string): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    if (name.startsWith("on")) continue; // no inline event handlers
    out[name] = m[2] ?? m[3] ?? m[4] ?? true;
  }
  return out;
}

export function parseCustomCode(html: string): { tags: CodeTag[]; ignored: number } {
  const tags: CodeTag[] = [];
  let consumed = "";
  for (const m of (html || "").matchAll(TAG_RE)) {
    consumed += m[0];
    if (m[1]) {
      tags.push({ tag: m[1].toLowerCase() as CodeTag["tag"], attrs: parseAttrs(m[2] ?? ""), content: m[3] ?? "" });
    } else if (m[4]) {
      tags.push({ tag: m[4].toLowerCase() as CodeTag["tag"], attrs: parseAttrs(m[5] ?? ""), content: "" });
    }
  }
  // Rough count of other elements that will not be used (e.g. a stray <div>).
  const rest = (html || "").replace(TAG_RE, "").replace(/<!--[\s\S]*?-->/g, "");
  const ignored = (rest.match(/<[a-zA-Z]/g) ?? []).length;
  void consumed;
  return { tags, ignored };
}

/** HTML attribute names → the React prop names they must be rendered as. */
export const REACT_ATTR: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  crossorigin: "crossOrigin",
  "http-equiv": "httpEquiv",
  charset: "charSet",
  referrerpolicy: "referrerPolicy",
  nomodule: "noModule",
  fetchpriority: "fetchPriority",
};
