"use client";

import { useEffect } from "react";

/** Counts one read per article per browser session (for /admin/blog). */
export function ArticleViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `rt-read:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode: count it anyway */
    }
    void fetch(`/api/blog/${encodeURIComponent(slug)}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [slug]);
  return null;
}
