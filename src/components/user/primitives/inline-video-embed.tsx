"use client";

import { ExternalLink } from "lucide-react";

interface Props {
  url: string;
  /** Optional title for accessibility / iframe title attribute */
  title?: string;
  className?: string;
}

type Resolved =
  | { kind: "youtube"; embedUrl: string }
  | { kind: "vimeo"; embedUrl: string }
  | { kind: "file"; mime: string }
  | { kind: "iframe"; embedUrl: string }
  | { kind: "unknown" };

function resolve(url: string): Resolved {
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

/** True when `url` is a YouTube/Vimeo/direct-video link that InlineVideoEmbed can
 *  play inline — so callers (e.g. the feed card) can render a player instead of a
 *  static link-preview card. */
export function isEmbeddableVideoUrl(url: string): boolean {
  const kind = resolve(url).kind;
  return kind === "youtube" || kind === "vimeo" || kind === "file" || kind === "iframe";
}

export function InlineVideoEmbed({ url, title = "Video", className = "" }: Props) {
  const r = resolve(url);

  if (r.kind === "youtube" || r.kind === "vimeo" || r.kind === "iframe") {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-xl bg-black border border-gray-800 ${className}`}
        style={{ paddingBottom: "56.25%" }}
      >
        <iframe
          src={r.embedUrl}
          title={title}
          className="absolute inset-0 w-full h-full"
          frameBorder={0}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  if (r.kind === "file") {
    return (
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        className={`w-full rounded-xl bg-black border border-gray-800 ${className}`}
      />
    );
  }

  // Fallback for unrecognised URLs — keep the link so users can still open it
  return (
    <div
      className={`rounded-xl border border-gray-800 bg-gray-900 p-4 ${className}`}
    >
      <p className="text-sm text-gray-300 mb-2">{title}</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"
      >
        <ExternalLink className="w-4 h-4" />
        Open video
      </a>
    </div>
  );
}
