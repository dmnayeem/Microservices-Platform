"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  GraduationCap,
  Lock,
  Medal,
  Megaphone,
  Share2,
  Sparkles,
  Store,
  Target,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { ApplyModal, type RoleCard } from "@/app/(main)/profile/become-creator/_components/BecomeCreatorView";
import type { ProgramIcon, ProgramKey } from "@/lib/application-requirements";

export type HubStatus = "none" | "pending" | "active" | "rejected";

export interface HubCard {
  key: ProgramKey;
  label: string;
  blurb: string;
  benefits: string[];
  icon: ProgramIcon;
  flowHref: string | null;
  dashboardHref: string;
  note: string;
  enabled: boolean;
  checks: { key: string; label: string; met: boolean; href: string | null }[];
  eligible: boolean;
  status: HubStatus;
  adminNote: string | null;
  appliedAt: string | null;
  blockedReason: string | null;
}

const ICONS: Record<ProgramIcon, LucideIcon> = {
  store: Store,
  briefcase: Briefcase,
  target: Target,
  megaphone: Megaphone,
  building: Building2,
  share: Share2,
  graduation: GraduationCap,
  medal: Medal,
  badge: BadgeCheck,
};

const STATUS_PILL: Record<HubStatus, { text: string; cls: string }> = {
  none: { text: "Not applied", cls: "bg-(--app-surface-2) text-(--app-ink-3)" },
  pending: { text: "Pending review", cls: "bg-amber-500/10 text-amber-400" },
  active: { text: "Approved", cls: "bg-emerald-500/10 text-emerald-400" },
  rejected: { text: "Not approved", cls: "bg-red-500/10 text-red-400" },
};

export function ApplyHubView({ cards, focus }: { cards: HubCard[]; focus: ProgramKey | null }) {
  const [applying, setApplying] = useState<HubCard | null>(null);

  // /apply?type=X — bring that program into view and, for the form-based
  // ones the member can apply to right now, open the form.
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`program-${focus}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const c = cards.find((x) => x.key === focus);
    if (c && canApply(c) && !c.flowHref) setApplying(c);
    // Only on arrival — not every time the server data refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div className="space-y-5 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-(--app-accent-ink)" />
          Apply
        </h1>
        <p className="text-sm text-(--app-ink-3) mt-1">
          Every program in one place — sell, offer services, buy tasks, advertise, teach, become an
          ambassador or get the blue badge. See what each one needs, where your application stands,
          and apply.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map((c) => (
          <ProgramCard key={c.key} card={c} focused={c.key === focus} onApply={() => setApplying(c)} />
        ))}
      </div>

      {applying && <ApplyModal card={toRoleCard(applying)} onClose={() => setApplying(null)} />}
    </div>
  );
}

function canApply(c: HubCard) {
  return c.enabled && c.eligible && !c.blockedReason && (c.status === "none" || c.status === "rejected");
}

function toRoleCard(c: HubCard): RoleCard {
  return {
    key: c.key,
    label: c.label,
    blurb: c.blurb,
    dashboardHref: c.dashboardHref,
    applyType: c.key,
    status: c.status === "rejected" ? "rejected" : "apply",
    adminNote: c.adminNote,
  };
}

function ProgramCard({ card: c, focused, onApply }: { card: HubCard; focused: boolean; onApply: () => void }) {
  const Icon = ICONS[c.icon] ?? Sparkles;
  const pill = STATUS_PILL[c.status];
  const isBadge = c.key === "BLUE_BADGE";
  const applyLabel = isBadge ? "Get the badge" : c.status === "rejected" ? "Apply again" : "Apply";

  return (
    <section
      id={`program-${c.key}`}
      className={`scroll-mt-24 rounded-xl border bg-(--app-surface) p-4 flex flex-col ${
        focused ? "border-(--app-accent-edge) ring-2 ring-(--app-accent-edge)/40" : "border-(--app-line)"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-(--app-cta)/10 text-(--app-accent-ink) grid place-items-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-white">{c.label}</h2>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${pill.cls}`}>
              {isBadge && c.status === "active" ? "Active" : pill.text}
            </span>
          </div>
          <p className="text-xs text-(--app-ink-3) mt-0.5">{c.blurb}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-1">
        {c.benefits.map((b) => (
          <li key={b} className="flex items-start gap-1.5 text-xs text-(--app-ink-2)">
            <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0 text-(--app-accent-ink)" />
            {b}
          </li>
        ))}
      </ul>

      {(c.checks.length > 0 || c.note) && c.status !== "active" && (
        <div className="mt-3 rounded-lg border border-(--app-line) bg-(--app-page) p-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-(--app-ink-3) mb-1.5">Requirements</p>
          {c.checks.length > 0 ? (
            <ul className="space-y-1">
              {c.checks.map((r) => (
                <li key={r.key} className="flex items-start gap-1.5 text-xs">
                  {r.met ? (
                    <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 mt-px shrink-0 text-red-400" />
                  )}
                  <span className={r.met ? "text-(--app-ink-2)" : "text-(--app-ink)"}>{r.label}</span>
                  {!r.met && r.href && (
                    <Link href={r.href} className="ml-auto shrink-0 font-semibold text-(--app-accent-ink) hover:underline">
                      Fix
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-(--app-ink-2)">No extra requirements.</p>
          )}
          {c.note && <p className="mt-2 text-xs text-(--app-ink-3) whitespace-pre-line">{c.note}</p>}
        </div>
      )}

      {c.status === "rejected" && (
        <p className="mt-3 text-[11px] text-red-300/80 bg-red-500/5 border border-red-500/20 rounded-lg px-2 py-1.5">
          Your last application was not approved.{c.adminNote ? ` Reviewer note: ${c.adminNote}` : ""}
        </p>
      )}

      <div className="mt-auto pt-3">
        <div className="pt-3 border-t border-(--app-line)">
          {c.status === "active" ? (
            <Link
              href={c.dashboardHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
            >
              <CheckCircle2 className="w-4 h-4" /> {isBadge ? "Manage your badge" : "You have access — open"}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : c.status === "pending" ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400">
              <Clock className="w-4 h-4" /> Pending review
              {c.appliedAt && (
                <span className="text-xs font-normal text-(--app-ink-3)">
                  · applied {new Date(c.appliedAt).toLocaleDateString()}
                </span>
              )}
            </span>
          ) : !c.enabled ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-(--app-ink-3)">
              <Lock className="w-4 h-4" /> Not open right now
            </span>
          ) : c.blockedReason ? (
            <span className="text-xs text-(--app-ink-3)">{c.blockedReason}</span>
          ) : !c.eligible ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-(--app-ink-3)">
              <Lock className="w-4 h-4" /> Meet the requirements above to {isBadge ? "get it" : "apply"}
            </span>
          ) : c.flowHref ? (
            <Link
              href={c.flowHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-(--app-cta) px-3.5 py-2 text-sm font-bold text-(--app-on-cta)"
            >
              {applyLabel} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onApply}
              className="inline-flex items-center gap-1.5 rounded-lg bg-(--app-cta) px-3.5 py-2 text-sm font-bold text-(--app-on-cta)"
            >
              {applyLabel} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
