"use client";

import { useEffect, useState } from "react";
import { POST_URL_SOURCE } from "@/lib/post-urls";
import Link from "next/link";
import { trackLinkClick } from "@/lib/track-link-click";

// ─────────────────────────────────────────────────────────────────────────────
// RenderedContent — links URLs, @mentions, and #hashtags in post text
// ─────────────────────────────────────────────────────────────────────────────
// Matches a URL, an @mention, or a #hashtag (Unicode letters/digits/_). One
// combined pass so the three don't clobber each other; gaps go to renderFormatted.
// The mention charset mirrors USERNAME_REGEX (lib/username.ts) and the server
// parser in lib/mentions.ts — dots and hyphens are legal in a handle, and
// `john.doe` is exactly what a Google email address produces. The lookbehind
// stops an email in post text ("bob@x.com") becoming a bogus @x.com mention.
// The URL half is spliced in from `@/lib/post-urls` so the composer's preview
// and this renderer's link agree on what a link is. It used to be a local
// `https?:\/\/[^\s]+`, which meant "example.com" was neither previewed nor
// linked — it just sat there as text. `POST_URL_SOURCE` has no capture groups
// of its own, so the group numbering below is unchanged.
const ENTITY_RE = new RegExp(
  `(${POST_URL_SOURCE})|(?<![a-zA-Z0-9._-])@([a-zA-Z0-9_][a-zA-Z0-9._-]{1,29})|#([\\p{L}\\p{N}_]{2,50})`,
  "gui"
);
// Trailing punctuation that should NOT be part of a matched URL.
const URL_TRAILING_RE = /[.,;:!?)\]}'"]+$/;
// …or of a matched @handle. Kept out of the link and pushed back as text.
const HANDLE_TRAILING_RE = /[._-]+$/;

/** Compact display label for a URL (drop protocol + trailing slash, cap length). */
function urlLabel(url: string): string {
  let s = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (s.length > 50) s = s.slice(0, 48) + "…";
  return s;
}
// Render **bold**, *italic* and __underline__ markdown within a plain-text
// chunk as React nodes (no HTML injection). Used between @mention segments in
// RenderedContent.
//
// Underline is `__x__` and NOT `_x_` on purpose: single underscores are ordinary
// characters in file names, handles and snake_case, and a post reading
// "run make_all_now" would otherwise render half of itself underlined.
export function renderFormatted(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|__([^_]+)__/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<span key={`${keyPrefix}-t${k++}`}>{text.slice(last, m.index)}</span>);
    }
    if (m[1] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-b${k++}`} className="font-bold">
          {m[1]}
        </strong>
      );
    } else if (m[2] !== undefined) {
      out.push(
        <em key={`${keyPrefix}-i${k++}`} className="italic">
          {m[2]}
        </em>
      );
    } else if (m[3] !== undefined) {
      out.push(
        <u key={`${keyPrefix}-u${k++}`} className="underline">
          {m[3]}
        </u>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(<span key={`${keyPrefix}-t${k++}`}>{text.slice(last)}</span>);
  }
  return out;
}

export function RenderedContent({
  content,
  postId,
}: {
  content: string;
  /** Post id — enables link-click tracking on inline URLs (feed post context). */
  postId?: string;
}) {
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const usernames = Array.from(
      content.matchAll(/(?<![a-zA-Z0-9._-])@([a-zA-Z0-9_][a-zA-Z0-9._-]{1,29})/g)
    )
      .map((m) => m[1].replace(HANDLE_TRAILING_RE, "").toLowerCase())
      .filter((u) => u.length >= 3);
    const unique = Array.from(new Set(usernames));
    if (unique.length === 0) return;
    let cancel = false;
    Promise.all(
      unique.map((u) =>
        fetch(`/api/users/search?q=${encodeURIComponent(u)}&limit=1`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            const hit = d?.users?.[0];
            return hit && hit.username?.toLowerCase() === u
              ? { username: u, id: hit.id }
              : null;
          })
          .catch(() => null)
      )
    ).then((rows) => {
      if (cancel) return;
      const map: Record<string, string> = {};
      for (const r of rows) {
        if (r) map[r.username] = r.id;
      }
      if (Object.keys(map).length > 0) setMentionMap(map);
    });
    return () => {
      cancel = true;
    };
  }, [content]);

  // Split content by URL / @mention / #hashtag; render each; gaps → renderFormatted.
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  for (const m of content.matchAll(ENTITY_RE)) {
    const start = m.index ?? 0;
    const [, urlRaw, username, tag] = m;

    // URL: trim trailing punctuation (kept in the following text), validate scheme.
    const matchLen = m[0].length;
    if (urlRaw) {
      const trailing = urlRaw.match(URL_TRAILING_RE)?.[0] ?? "";
      const shown = trailing ? urlRaw.slice(0, -trailing.length) : urlRaw;
      // `href` gets the scheme the author did not type; the LABEL keeps what
      // they wrote. Someone who pastes "example.com" should see "example.com"
      // and still land on https://example.com when they click it.
      const url = /^https?:\/\//i.test(shown) ? shown : `https://${shown}`;
      let valid = false;
      try {
        const u = new URL(url);
        valid =
          (u.protocol === "http:" || u.protocol === "https:") &&
          u.hostname.includes(".");
      } catch {
        valid = false;
      }
      if (!valid) continue; // leave it to be rendered as plain text by the gap
      if (start > lastIdx) {
        parts.push(...renderFormatted(content.slice(lastIdx, start), `p${key++}`));
      }
      parts.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={() => trackLinkClick(postId)}
          className="text-indigo-400 hover:text-indigo-300 hover:underline break-all"
        >
          {urlLabel(shown)}
        </a>
      );
      lastIdx = start + (matchLen - trailing.length);
      continue;
    }

    if (start > lastIdx) {
      parts.push(...renderFormatted(content.slice(lastIdx, start), `p${key++}`));
    }

    if (username) {
      // Same trim as the server parser: advance past the handle only, so
      // sentence punctuation lands in the following text run.
      const handle = username.replace(HANDLE_TRAILING_RE, "");
      const userId = handle.length >= 3 ? mentionMap[handle.toLowerCase()] : undefined;
      parts.push(
        userId ? (
          <Link
            key={key++}
            href={`/u/${encodeURIComponent(handle)}`}
            className="text-indigo-400 hover:text-indigo-300 hover:underline font-semibold"
          >
            @{handle}
          </Link>
        ) : (
          <span key={key++}>@{handle}</span>
        )
      );
      lastIdx = start + 1 + handle.length;
      continue;
    } else if (tag) {
      parts.push(
        <Link
          key={key++}
          href={`/hashtag/${encodeURIComponent(tag)}`}
          className="text-indigo-400 hover:text-indigo-300 hover:underline"
        >
          #{tag}
        </Link>
      );
    }
    lastIdx = start + matchLen;
  }
  if (lastIdx < content.length) {
    parts.push(...renderFormatted(content.slice(lastIdx), `p${key++}`));
  }
  return <>{parts}</>;
}
