// Pure URL classifier — NO client/server-only imports, so it's usable from both
// client components (composer, feed card) and server routes (post-create gate).
// Recognises embeddable video links (YouTube / Vimeo / direct video files) and
// resolves them to an embed target for InlineVideoEmbed.

export type ResolvedVideo =
  | { kind: "youtube"; embedUrl: string }
  | { kind: "vimeo"; embedUrl: string }
  | { kind: "file"; mime: string }
  | { kind: "iframe"; embedUrl: string }
  | { kind: "unknown" };

export function resolveVideoUrl(url: string): ResolvedVideo {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: "unknown" };
  }
  const host = u.hostname.replace(/^www\./, "");

  // YouTube
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    if (id) return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
  }
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    if (u.pathname.startsWith("/embed/")) {
      return { kind: "youtube", embedUrl: u.toString() };
    }
    if (u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      if (id) return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
    }
    const v = u.searchParams.get("v");
    if (v) return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${v}` };
  }

  // Vimeo
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (host === "player.vimeo.com" && parts[0] === "video" && parts[1]) {
      return { kind: "vimeo", embedUrl: u.toString() };
    }
    const id = parts.find((p) => /^\d+$/.test(p));
    if (id) return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
  }

  // Direct video file
  const lower = u.pathname.toLowerCase();
  if (lower.endsWith(".mp4")) return { kind: "file", mime: "video/mp4" };
  if (lower.endsWith(".webm")) return { kind: "file", mime: "video/webm" };
  if (lower.endsWith(".ogg") || lower.endsWith(".ogv"))
    return { kind: "file", mime: "video/ogg" };
  if (lower.endsWith(".mov")) return { kind: "file", mime: "video/quicktime" };
  if (lower.endsWith(".m3u8")) return { kind: "file", mime: "application/x-mpegURL" };

  return { kind: "unknown" };
}

/** True when `url` is a YouTube/Vimeo/direct-video link that plays inline — so
 *  callers render a player instead of a static link-preview card, and the
 *  post-create gate treats it as a "video" (shareYouTube) rather than a plain
 *  link (shareLinks). */
export function isEmbeddableVideoUrl(url: string): boolean {
  const kind = resolveVideoUrl(url).kind;
  return kind === "youtube" || kind === "vimeo" || kind === "file" || kind === "iframe";
}

/**
 * Normalize a URL into a form the in-app player (react-player v3) reliably
 * recognises. react-player's own YouTube/Vimeo matchers are strict and reject
 * many valid links (mobile `m.youtube.com`, extra query params, etc.), silently
 * falling back to a broken `<video>` element → black screen. For YouTube/Vimeo
 * we hand it the canonical embed URL (which its regex DOES match); everything
 * else (direct files, unknown) passes through unchanged. Returns "" for input
 * that isn't a usable URL so callers can show a clear error instead of a black box.
 */
export function playerSource(url: string): string {
  if (!url) return "";
  const r = resolveVideoUrl(url);
  if (r.kind === "youtube" || r.kind === "vimeo" || r.kind === "iframe") {
    return r.embedUrl;
  }
  // Direct video file or an unrecognised URL — let the player try the raw URL.
  return url;
}
