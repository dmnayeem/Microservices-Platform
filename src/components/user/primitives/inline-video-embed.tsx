"use client";

import { ExternalLink } from "lucide-react";
import { resolveVideoUrl } from "@/lib/video-url";

// Re-export so existing `@/components/user/primitives/inline-video-embed`
// importers of the predicate keep working.
export { isEmbeddableVideoUrl } from "@/lib/video-url";

interface Props {
  url: string;
  /** Optional title for accessibility / iframe title attribute */
  title?: string;
  className?: string;
}

export function InlineVideoEmbed({ url, title = "Video", className = "" }: Props) {
  const r = resolveVideoUrl(url);

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
