"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { platformShareUrl } from "@/components/user/primitives/social-share";

/**
 * Share row for the logged-out post page.
 *
 * Separate from `ShareModal` on purpose. That component reports the share back
 * to `/api/feed/:id/share`, which is session-guarded and increments the author's
 * `sharesCount` — a logged-out visitor has no session to attribute, so calling
 * it would just 401 on every tap. This row does the one thing that works
 * without an account: hand over the canonical URL.
 *
 * The URL is built on the SERVER from `NEXT_PUBLIC_APP_URL` and passed in, not
 * read from `window.location` — a link shared out of a preview deployment would
 * otherwise carry that deployment's hostname to every recipient.
 */
const PLATFORMS = [
  { key: "facebook", label: "Facebook" },
  { key: "x", label: "X" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "telegram", label: "Telegram" },
] as const;

export function PublicPostShare({
  url,
  title,
  text,
}: {
  url: string;
  title: string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the URL is visible in the field beside the button */
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-(--app-line) bg-(--app-surface) p-4">
      <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-(--app-ink)">
        <Link2 className="h-4 w-4 text-(--app-accent-ink)" aria-hidden />
        Share this post
      </h2>

      <div className="mt-3 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2.5 text-xs text-(--app-ink-2)">
          {url}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy link"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-(--app-cta) px-4 text-sm font-semibold text-(--app-on-cta) hover:opacity-90"
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* The row scrolls rather than wraps on a narrow phone, and each chip is a
          44px target — the anchors are styled directly, not through a
          `[&>a]` selector on the track, because that only reaches DIRECT
          children and has produced 20px tap targets here before. */}
      <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
        <div className="flex w-max gap-2">
          {PLATFORMS.map((p) => (
            <a
              key={p.key}
              href={platformShareUrl(p.key, url, `${title} — ${text}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-full border border-(--app-line) bg-(--app-page) px-4 text-sm font-semibold text-(--app-ink) hover:border-(--app-accent-edge) hover:text-(--app-ink)"
            >
              {p.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
