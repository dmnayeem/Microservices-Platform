"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// RenderedContent — splits text by @mentions and turns them into Links to /u/<id>
// ─────────────────────────────────────────────────────────────────────────────
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

  // Split content
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  for (const m of content.matchAll(/@([a-zA-Z0-9_]{2,30})/g)) {
    const start = m.index ?? 0;
    const username = m[1];
    if (start > lastIdx) {
      parts.push(...renderFormatted(content.slice(lastIdx, start), `p${key++}`));
    }
    const userId = mentionMap[username.toLowerCase()];
    if (userId) {
      parts.push(
        <Link
          key={key++}
          href={`/u/${encodeURIComponent(username)}`}
          className="text-indigo-400 hover:text-indigo-300 hover:underline font-semibold"
        >
          @{username}
        </Link>
      );
    } else {
      parts.push(<span key={key++}>@{username}</span>);
    }
    lastIdx = start + m[0].length;
  }
  if (lastIdx < content.length) {
    parts.push(...renderFormatted(content.slice(lastIdx), `p${key++}`));
  }
  return <>{parts}</>;
}
