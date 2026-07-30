"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Share2, Check, Handshake } from "lucide-react";

/**
 * "Share & earn" — shown on a product/course detail page. If the viewer has
 * joined the affiliate program it copies an affiliate link (`?aff=<code>`);
 * otherwise it points them to /affiliate to join. Server-side attribution only
 * pays out when the item actually has a reward set, so this is safe to show
 * broadly. `eligible={false}` hides it entirely.
 */
export function AffiliateShareButton({
  eligible = true,
  className,
}: {
  eligible?: boolean;
  className?: string;
}) {
  const [joined, setJoined] = useState<boolean | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    fetch("/api/affiliate/me")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setJoined(!!d.joined);
        setCode(d.code ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eligible]);

  if (!eligible || joined === null) return null;

  if (!joined) {
    return (
      <Link
        href="/affiliate"
        className={
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/40 text-xs font-bold hover:bg-indigo-500/25 " +
          (className ?? "")
        }
      >
        <Handshake className="w-3.5 h-3.5" />
        Earn by sharing
      </Link>
    );
  }

  const copy = async () => {
    const base =
      typeof window !== "undefined"
        ? window.location.href.split("?")[0]
        : "";
    const link = `${base}?aff=${encodeURIComponent(code ?? "")}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Affiliate link copied — earn on every sale you drive");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed", { description: link });
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/40 text-xs font-bold hover:bg-indigo-500/25 " +
        (className ?? "")
      }
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
      {copied ? "Link copied" : "Share & earn"}
    </button>
  );
}
