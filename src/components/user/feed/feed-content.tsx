"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// RenderedContent — links URLs, @mentions, and #hashtags in post text
// ─────────────────────────────────────────────────────────────────────────────
// Matches a URL, an @mention, or a #hashtag (Unicode letters/digits/_). One
// combined pass so the three don't clobber each other; gaps go to renderFormatted.
const ENTITY_RE =
  /(https?:\/\/[^\s]+)|@([a-zA-Z0-9_]{2,30})|#([\p{L}\p{N}_]{2,50})/gu;
// Trailing punctuation that should NOT be part of a matched URL.
const URL_TRAILING_RE = /[.,;:!?)\]}'"]+$/;

/** Compact display label for a URL (drop protocol + trailing slash, cap length). */
function urlLabel(url: string): string {
  let s = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (s.length > 50) s = s.slice(0, 48) + "…";
  return s;
}
// Render **bold** and *italic* markdown within a plain-text chunk as React nodes
// (no HTML injection). Used between @mention segments in RenderedContent.
export function renderFormatted(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
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
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(<span key={`${keyPrefix}-t${k++}`}>{text.slice(last)}</span>);
  }
  return out;
}

export function RenderedContent({ content }: { content: string }) {
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const usernames = Array.from(content.matchAll(/@([a-zA-Z0-9_]{2,30})/g)).map(
      (m) => m[1].toLowerCase()
    );
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
      const url = trailing ? urlRaw.slice(0, -trailing.length) : urlRaw;
      let valid = false;
      try {
        const u = new URL(url);
        valid = u.protocol === "http:" || u.protocol === "https:";
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
          className="text-indigo-400 hover:text-indigo-300 hover:underline break-all"
        >
          {urlLabel(url)}
        </a>
      );
      lastIdx = start + (matchLen - trailing.length);
      continue;
    }

    if (start > lastIdx) {
      parts.push(...renderFormatted(content.slice(lastIdx, start), `p${key++}`));
    }

    if (username) {
      const userId = mentionMap[username.toLowerCase()];
      parts.push(
        userId ? (
          <Link
            key={key++}
            href={`/u/${encodeURIComponent(username)}`}
            className="text-indigo-400 hover:text-indigo-300 hover:underline font-semibold"
          >
            @{username}
          </Link>
        ) : (
          <span key={key++}>@{username}</span>
        )
      );
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
