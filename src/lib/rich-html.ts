/**
 * Sanitising staff-written rich HTML (task instructions, blog posts, popups)
 * before it is rendered to every user. Client-safe; no DOM needed.
 *
 * Staff wrote it, but an admin account is exactly what an attacker would be
 * aiming for, so the output is treated as untrusted: scripts, forms, plugin
 * tags and event handlers are removed. The one iframe that survives is a
 * YouTube embed, rebuilt from its src alone so no attribute on the original
 * tag reaches the page.
 */

const YOUTUBE_EMBED =
  /^https:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\/[A-Za-z0-9_-]{6,}(?:\?[^"'<>\s]*)?$/;

function youtubeIframe(tag: string): string {
  const m = tag.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)')/i);
  const src = (m?.[2] ?? m?.[3] ?? "").replace(/&amp;/g, "&");
  if (!YOUTUBE_EMBED.test(src)) return "";
  const safe = src.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<iframe src="${safe}" loading="lazy" allowfullscreen frameborder="0" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
}

/** Keep YouTube embeds (rebuilt), drop every other iframe. */
export function keepYoutubeEmbeds(html: string): string {
  // One pass: a paired tag, else a lone/self-closing one, else a stray closing
  // tag. Two passes would run the second over the tags the first rebuilt.
  return html.replace(
    /<\s*iframe\b[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>|<\s*iframe\b[^>]*\/?\s*>|<\s*\/\s*iframe\s*>/gi,
    (t) => (/^<\s*\//.test(t) ? "" : youtubeIframe(t))
  );
}

export function sanitizeRichHtml(html: string): string {
  let s = String(html || "")
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*script\b[^>]*\/?\s*>/gi, "")
    .replace(/<\s*style\b[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "");
  s = keepYoutubeEmbeds(s);
  return s
    .replace(/<\s*(object|embed|form|input|button|textarea|select|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(object|embed|form|input|button|textarea|select|link|meta|base)\b[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src|xlink:href)\s*=\s*(["'])\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, '$1="#"')
    .replace(/javascript\s*:/gi, "");
}

/** Plain text of an HTML fragment (for word counts, excerpts, SEO checks). */
export function htmlToText(html: string): string {
  return String(html || "")
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
