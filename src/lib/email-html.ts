/**
 * Turning editor HTML into HTML an email client will actually render, and an
 * email into its plain-text alternative. Client-safe and pure: no DOM, no
 * server imports — the send path, the preview route and scripts/verify-email.ts
 * all run the same code.
 *
 * Why a second pass after `sanitizeRichHtml`: that function makes HTML safe for
 * OUR page, where a stylesheet exists. A mail client has no stylesheet — Gmail
 * strips `<style>` and every class — so an editor paragraph arrives unstyled,
 * images arrive at their natural 3000px width, and a relative `/api/media/…`
 * src points at the reader's mail provider instead of us. So every tag is
 * rebuilt from an allowlist with its styles inline, every URL is made absolute
 * https, and anything that is not a plain link or picture (iframes, forms,
 * colours picked for the dark admin screen) is dropped.
 */
import { sanitizeRichHtml } from "@/lib/rich-html";
import { mediaSrc } from "@/lib/media-url";

export const EMAIL_INK = "#374151";
export const EMAIL_HEADING = "#111827";
export const EMAIL_LINK = "#4f46e5";
export const EMAIL_FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

/** Widest an image may render inside the 600px card (32px padding each side). */
export const EMAIL_CONTENT_WIDTH = 536;

export type EmailHtmlResult = {
  html: string;
  /** Every href kept, absolute — for the link-safety screen. */
  links: string[];
  images: string[];
  /** URLs that were refused (javascript:, data:, http:, unparseable). */
  dropped: string[];
};

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/**
 * An absolute https URL for `raw`, or null.
 *
 * Relative paths are resolved against the public site, never against the
 * admin's browser — a preview made on localhost must not mail localhost links.
 * Our own S3/CloudFront media is rewritten to the same-origin proxy first,
 * because the bucket is private and the raw URL 403s.
 */
export function absoluteEmailUrl(
  raw: string | null | undefined,
  baseUrl: string,
  kind: "link" | "image" = "link"
): string | null {
  let u = decodeEntities(String(raw ?? "")).trim();
  if (!u) return null;
  if (kind === "link" && /^mailto:[^\s<>"']+@[^\s<>"']+$/i.test(u)) return u;
  u = mediaSrc(u);
  const base = baseUrl.replace(/\/+$/, "");
  if (u.startsWith("//")) u = `https:${u}`;
  else if (u.startsWith("/")) u = `${base}${u}`;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return null;
  }
  // The base itself may be http on a dev box; let that one through so the
  // preview still shows our own images, and refuse http everywhere else.
  const ownOrigin = (() => {
    try {
      return new URL(base).origin;
    } catch {
      return "";
    }
  })();
  if (parsed.protocol !== "https:" && !(parsed.origin === ownOrigin && parsed.protocol === "http:")) {
    return null;
  }
  return parsed.toString();
}

type Attrs = Record<string, string>;

function parseAttrs(s: string): Attrs {
  const out: Attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

const BLOCK_STYLE: Record<string, string> = {
  p: `margin:0 0 16px 0;font-size:16px;line-height:1.65;color:${EMAIL_INK};`,
  h1: `margin:24px 0 12px 0;font-size:26px;line-height:1.3;font-weight:800;color:${EMAIL_HEADING};`,
  h2: `margin:22px 0 10px 0;font-size:22px;line-height:1.3;font-weight:800;color:${EMAIL_HEADING};`,
  h3: `margin:20px 0 8px 0;font-size:19px;line-height:1.35;font-weight:700;color:${EMAIL_HEADING};`,
  h4: `margin:18px 0 8px 0;font-size:17px;line-height:1.4;font-weight:700;color:${EMAIL_HEADING};`,
  ul: `margin:0 0 16px 0;padding:0 0 0 24px;font-size:16px;line-height:1.65;color:${EMAIL_INK};`,
  ol: `margin:0 0 16px 0;padding:0 0 0 24px;font-size:16px;line-height:1.65;color:${EMAIL_INK};`,
  li: "margin:0 0 6px 0;",
  blockquote: `margin:0 0 16px 0;padding:12px 16px;border-left:4px solid #c7d2fe;background:#f5f7ff;color:${EMAIL_INK};`,
  pre: `margin:0 0 16px 0;padding:12px;background:#f3f4f6;border-radius:6px;font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;color:${EMAIL_HEADING};`,
  code: "font-family:Consolas,Menlo,monospace;font-size:14px;background:#f3f4f6;padding:1px 4px;border-radius:4px;",
  mark: `background:#fef08a;color:${EMAIL_HEADING};padding:0 2px;`,
  table: "width:100%;border-collapse:collapse;margin:0 0 16px 0;",
  td: `border:1px solid #e5e7eb;padding:8px 10px;font-size:14px;line-height:1.5;color:${EMAIL_INK};vertical-align:top;text-align:left;`,
  th: `border:1px solid #e5e7eb;padding:8px 10px;font-size:14px;line-height:1.5;color:${EMAIL_HEADING};vertical-align:top;text-align:left;font-weight:700;background:#f9fafb;`,
};

/** Tags kept bare (no attributes needed). */
const BARE = new Set(["strong", "b", "em", "i", "u", "s", "strike", "del", "sub", "sup", "thead", "tbody", "tr"]);
const ALIGNABLE = new Set(["p", "h1", "h2", "h3", "h4", "td", "th"]);

/** YouTube embed → a plain link: no mail client plays an iframe. */
function youtubeToLink(html: string): string {
  return html.replace(/<iframe\b[^>]*\ssrc="([^"]*)"[^>]*>\s*<\/iframe>/gi, (_, src: string) => {
    const id = decodeEntities(src).match(/\/embed\/([A-Za-z0-9_-]{6,})/)?.[1];
    return id
      ? `<p><a href="https://www.youtube.com/watch?v=${id}">&#9654; Watch the video on YouTube</a></p>`
      : "";
  });
}

export function toEmailSafeHtml(input: string, opts: { baseUrl: string }): EmailHtmlResult {
  const links: string[] = [];
  const images: string[] = [];
  const dropped: string[] = [];

  let s = sanitizeRichHtml(String(input || ""));
  s = youtubeToLink(s)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(iframe|svg|math|video|audio|picture|source|noscript|template|head|title)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");

  let anchorOpen: "kept" | "dropped" | null = null;
  let liDepth = 0;

  s = s.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_whole, slash: string, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    const closing = slash === "/";

    if (tag === "a") {
      if (closing) {
        const was = anchorOpen;
        anchorOpen = null;
        return was === "kept" ? "</a>" : "";
      }
      const a = parseAttrs(rawAttrs);
      const href = absoluteEmailUrl(a.href, opts.baseUrl, "link");
      if (!href) {
        if (a.href && !a.href.startsWith("#")) dropped.push(a.href);
        anchorOpen = "dropped";
        return "";
      }
      links.push(href);
      anchorOpen = "kept";
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_LINK};text-decoration:underline;font-weight:600;">`;
    }

    if (tag === "img") {
      if (closing) return "";
      const a = parseAttrs(rawAttrs);
      const src = absoluteEmailUrl(a.src, opts.baseUrl, "image");
      if (!src) {
        if (a.src) dropped.push(a.src);
        return "";
      }
      images.push(src);
      const w = parseInt(a.width ?? "", 10);
      const width = Number.isFinite(w) && w > 0 ? Math.min(w, EMAIL_CONTENT_WIDTH) : EMAIL_CONTENT_WIDTH;
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(decodeEntities(a.alt ?? a.title ?? ""))}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;margin:8px 0 16px 0;border-radius:8px;" />`;
    }

    if (tag === "br") return closing ? "" : "<br />";
    if (tag === "hr") return closing ? "" : `<hr style="border:0;border-top:1px solid #e5e7eb;height:0;margin:24px 0;" />`;

    if (BARE.has(tag)) return closing ? `</${tag}>` : `<${tag}>`;

    if (tag in BLOCK_STYLE) {
      if (tag === "li") liDepth += closing ? -1 : 1;
      if (closing) return `</${tag}>`;
      const a = parseAttrs(rawAttrs);
      let style = BLOCK_STYLE[tag];
      // A paragraph inside a list item would add a 16px gap after every bullet.
      if (tag === "p" && liDepth > 0) style = style.replace("margin:0 0 16px 0;", "margin:0;");
      if (ALIGNABLE.has(tag)) {
        const al = (a.style ?? "").match(/text-align\s*:\s*(left|center|right|justify)/i)?.[1];
        if (al) style += `text-align:${al.toLowerCase()};`;
      }
      let extra = "";
      if (tag === "table") extra = ` role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"`;
      if (tag === "td" || tag === "th") {
        for (const k of ["colspan", "rowspan"]) {
          const n = parseInt(a[k] ?? "", 10);
          if (Number.isFinite(n) && n > 1 && n < 50) extra += ` ${k}="${n}"`;
        }
      }
      return `<${tag}${extra} style="${style}">`;
    }

    // span, div, colgroup, font and anything else: unwrap, keep the text.
    // The editor's text colours were picked against the dark admin screen and
    // are unreadable on a white email (white text is one of the swatches).
    return "";
  });

  if (anchorOpen === "kept") s += "</a>";

  return { html: s.trim(), links: [...new Set(links)], images: [...new Set(images)], dropped };
}

/**
 * The plain-text alternative of an HTML fragment.
 *
 * Every email carries one: a message with only an HTML part is a classic spam
 * signal, and some readers (and every accessibility tool) want the text.
 * Links keep their address — "Claim it (https://…)" — or the text part is
 * useless as a fallback.
 */
export function emailHtmlToText(html: string): string {
  let s = String(html || "");
  s = s
    .replace(/<\s*(script|style|head|title)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Hidden preheader blocks are for the inbox list, not the body.
    .replace(/<(div|span)\b[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => {
      const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
      const url = decodeEntities(href).trim();
      if (!url || url.startsWith("#")) return text;
      const bare = url.replace(/^mailto:/i, "");
      return !text || text === url || text === bare ? url : `${text} (${url})`;
    })
    .replace(/<img\b[^>]*\balt\s*=\s*"([^"]+)"[^>]*>/gi, (_, alt: string) => `[${decodeEntities(alt)}]`)
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\b[^>]*>/gi, "\n----------\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|h[1-6]|blockquote|pre|table|ul|ol)>/gi, "\n\n")
    .replace(/<\/li>/gi, "")
    .replace(/<\/(tr|div)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s)
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}

/* ------------------------------------------------------------------ *
 * How a broadcast's email body is stored
 * ------------------------------------------------------------------ */

/**
 * The rich body and preheader ride in the existing `Broadcast.emailBody` text
 * column behind a one-line header comment, instead of in new columns.
 *
 * Deliberate: this app's database is shared by every running deploy, and
 * adding columns to `schema.prisma` makes every full-row `broadcast` read in
 * the generated client select them — so any deploy built before the migration
 * is applied would fail every broadcast read with "column does not exist".
 * A body with no header is the plain text it always was.
 */
const HEADER = /^<!--rt:email format=(html|text) pre=([^\s>]*)-->\n?/;

export type StoredEmailBody = { format: "html" | "text"; body: string; preheader: string };

export function encodeEmailBody(b: StoredEmailBody): string {
  const pre = encodeURIComponent(b.preheader.trim().slice(0, 200));
  if (b.format === "text" && !pre) return b.body;
  return `<!--rt:email format=${b.format} pre=${pre}-->\n${b.body}`;
}

export function decodeEmailBody(raw: string | null | undefined): StoredEmailBody {
  const s = String(raw ?? "");
  const m = s.match(HEADER);
  if (!m) return { format: "text", body: s, preheader: "" };
  let preheader = "";
  try {
    preheader = decodeURIComponent(m[2]);
  } catch {
    preheader = "";
  }
  return { format: m[1] as "html" | "text", body: s.slice(m[0].length), preheader };
}
