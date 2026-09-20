"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  GraduationCap,
  Store,
  Megaphone,
  Building2,
  Share2,
  ArrowRight,
  Clock,
  CheckCircle2,
  X,
  Loader2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface RoleCard {
  key: string; // "TUTOR" | CreatorApplicationType
  label: string;
  blurb: string;
  dashboardHref: string;
  applyType?: string; // generic types apply via the form
  applyHref?: string; // tutor links out
  status: "has_access" | "pending" | "rejected" | "apply";
  adminNote?: string | null;
}

const ICONS: Record<string, LucideIcon> = {
  TUTOR: GraduationCap,
  MARKETPLACE_SELLER: Store,
  ADVERTISER: Megaphone,
  AGENCY: Building2,
  AFFILIATE: Share2,
};

const DETAIL_LABEL: Record<string, string> = {
  MARKETPLACE_SELLER: "What will you sell?",
  ADVERTISER: "Business / brand name",
  AGENCY: "Agency name",
  AFFILIATE: "Where will you promote? (channels / audience)",
};

export function BecomeCreatorView({ cards }: { cards: RoleCard[] }) {
  const [applying, setApplying] = useState<RoleCard | null>(null);

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-(--app-accent-ink)" />
          Become a Creator
        </h1>
        {/* Buying is on this page too, and nothing said so. Everything about
          * it read as selling — "Become a Creator", "creator/seller role" —
          * so someone who wanted to PAY people to do a job had no reason to
          * think this was their page. */}
        <p className="text-sm text-(--app-ink-3) mt-1">
          Apply to sell on the marketplace, run ads, or{" "}
          <span className="text-(--app-ink)">buy tasks</span> — paying people here
          to follow, share or complete a job you set. An admin reviews each
          request and you&apos;ll be notified once approved.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c) => {
          const Icon = ICONS[c.key] ?? Sparkles;
          return (
            <div
              key={c.key}
              className="rounded-xl border border-(--app-line) bg-(--app-surface) p-4 flex flex-col"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-(--app-cta)/10 text-(--app-accent-ink) grid place-items-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-white">{c.label}</h2>
                  <p className="text-xs text-(--app-ink-3) mt-0.5">{c.blurb}</p>
                </div>
              </div>

              {c.status === "rejected" && c.adminNote && (
                <p className="mt-2 text-[11px] text-red-300/80 bg-red-500/5 border border-red-500/20 rounded-lg px-2 py-1.5">
                  Not approved: {c.adminNote}
                </p>
              )}

              <div className="mt-3 pt-3 border-t border-(--app-line)">
                {c.status === "has_access" ? (
                  <Link
                    href={c.dashboardHref}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Access granted — open
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ) : c.status === "pending" ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400">
                    <Clock className="w-4 h-4" /> Pending review
                  </span>
                ) : c.applyHref ? (
                  <Link
                    href={c.applyHref}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--app-accent-ink) hover:text-(--app-accent-ink)"
                  >
                    {c.status === "rejected" ? "Re-apply" : "Apply"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setApplying(c)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--app-accent-ink) hover:text-(--app-accent-ink)"
                  >
                    {c.status === "rejected" ? "Re-apply" : "Apply"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {applying && (
        <ApplyModal card={applying} onClose={() => setApplying(null)} />
      )}
    </div>
  );
}

function ApplyModal({ card, onClose }: { card: RoleCard; onClose: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const detailLabel = DETAIL_LABEL[card.applyType ?? ""] ?? "Details";

  const submit = async () => {
    if (message.trim().length < 20) {
      toast.error("Please write at least 20 characters.");
      return;
    }
    setBusy(true);
    try {
      const linkList = links
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/creators/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: card.applyType,
          message: message.trim(),
          links: linkList,
          payload: detail.trim() ? { detail: detail.trim() } : undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      toast.success("Application submitted — awaiting review.");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Couldn't apply", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-(--app-line) bg-(--app-surface) p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-white">Apply — {card.label}</h2>
          <button onClick={onClose} className="text-(--app-ink-3) hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
            Why you? Tell us about yourself <span className="text-red-400">*</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Your experience, what you'll do, and why we should approve you…"
            className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
            {detailLabel}
          </label>
          <input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
            Links (portfolio / website / social) — one per line
          </label>
          <textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            rows={2}
            placeholder="https://…"
            className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-2.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-2) text-(--app-ink) text-sm font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 py-2.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit application
          </button>
        </div>
      </div>
    </div>
  );
}
