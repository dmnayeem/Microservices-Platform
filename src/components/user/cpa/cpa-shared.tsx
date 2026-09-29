"use client";

import { Megaphone } from "lucide-react";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { cn, pts, usd } from "@/lib/utils";
import { cpaWaitLabel } from "@/lib/cpa/retry";

/** An offer as GET /api/cpa/offers(/:id) sends it — never a tracking URL. */
export interface CpaOffer {
  id: string;
  title: string;
  network: string;
  category: string | null;
  description: string | null;
  steps: string[];
  logoUrl: string | null;
  imageUrl: string | null;
  points: number;
  estMinutes: number | null;
  difficulty: string;
  completionMode: string;
  proofRequired: boolean;
  proofInstructions: string | null;
  holdHours: number;
  featured: boolean;
}

/** The user's own conversion on an offer. */
export interface CpaMine {
  id: string;
  offerId: string;
  status: CpaStatus | string;
  points: number;
  proofImages: string[];
  proofText: string | null;
  rejectionReason: string | null;
  heldUntil: string | null;
  creditedAt: string | null;
  createdAt: string;
  /** When it was decided — for a REJECTED one, the retry wait counts from here. */
  reviewedAt: string | null;
  attempts: number;
}

export type CpaStatus = "PENDING" | "HELD" | "APPROVED" | "REJECTED" | "REVERSED";

/**
 * Why a Start was refused — the codes `/go/cpa/<id>` puts in `?error=`. The
 * server copy lives in src/lib/cpa/eligibility (server-only), so the four
 * redirect-only codes are added here.
 */
export const CPA_ERROR_MESSAGES: Record<string, { title: string; body: string }> = {
  NOT_FOUND: { title: "Offer not found", body: "This offer doesn't exist any more." },
  INACTIVE: { title: "Offer paused", body: "This offer isn't available right now. Check back later." },
  AUDIENCE: { title: "Not available for you", body: "This offer isn't available for your profile or location." },
  TOTAL_CAP: { title: "Offer full", body: "This offer has reached its limit." },
  DAILY_CAP: { title: "Today's limit reached", body: "This offer is full for today. Try again tomorrow." },
  ALREADY: { title: "Already done", body: "You've already done this offer — see its status below." },
  RETRY_LATER: {
    title: "Not yet",
    body: "This offer was rejected. You can try it again once the wait is over — the time is shown below.",
  },
  PROFILE_INCOMPLETE: {
    title: "Complete your profile",
    body: "Finish your profile to start offers. Open your profile, fill in what's missing, then come back.",
  },
  BLOCKED: { title: "Account restricted", body: "Your account can't start offers right now. Contact support if this looks wrong." },
  RATE_LIMITED: { title: "Too many tries", body: "You pressed Start too often. Wait a minute and try again." },
  BAD_LINK: { title: "Offer link problem", body: "This offer's link isn't working. We've been told — try another offer." },
};

export function cpaErrorMessage(code: string | null | undefined) {
  if (!code) return null;
  return (
    CPA_ERROR_MESSAGES[code] ?? {
      title: "Couldn't start the offer",
      body: "Something went wrong. Please try again.",
    }
  );
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending review", cls: "app-chip-warn" },
  HELD: { label: "Approved", cls: "app-chip-info" },
  APPROVED: { label: "Approved", cls: "app-chip-in" },
  REJECTED: { label: "Rejected", cls: "app-chip-out" },
  REVERSED: { label: "Reversed", cls: "app-chip-out" },
};

/**
 * The retry line for a REJECTED conversion: "You can try again in 5h" while
 * the wait runs, "You can try again now" once it's over.
 */
export function tryAgainText(retryAt: string | null | undefined, availableNow: boolean): string | null {
  if (availableNow) return "You can try this offer again now.";
  if (!retryAt) return null;
  return `You can try again in ${cpaWaitLabel(retryAt)}.`;
}

/** "in 5h" / "in 2d" / "soon" — for a HELD conversion's release time. */
export function releaseIn(heldUntil: string | null): string {
  if (!heldUntil) return "soon";
  const ms = new Date(heldUntil).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 60_000) return "soon";
  const h = Math.ceil(ms / 3_600_000);
  if (h < 48) return `in ${h}h`;
  return `in ${Math.ceil(h / 24)}d`;
}

export function CpaStatusChip({
  status,
  heldUntil,
  className,
}: {
  status: string;
  heldUntil?: string | null;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? { label: status, cls: "" };
  const label = status === "HELD" ? `Approved · releasing ${releaseIn(heldUntil ?? null)}` : meta.label;
  return <span className={cn("app-chip whitespace-nowrap", meta.cls, className)}>{label}</span>;
}

const DIFFICULTY: Record<string, { label: string; cls: string }> = {
  EASY: { label: "Easy", cls: "app-chip-in" },
  MEDIUM: { label: "Medium", cls: "app-chip-warn" },
  HARD: { label: "Hard", cls: "app-chip-out" },
};

export function DifficultyChip({ difficulty }: { difficulty: string }) {
  const d = DIFFICULTY[difficulty] ?? { label: difficulty, cls: "" };
  return <span className={cn("app-chip whitespace-nowrap", d.cls)}>{d.label}</span>;
}

export function OfferLogo({
  src,
  alt,
  size = 48,
  className,
}: {
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-xl bg-(--app-surface-2) border border-(--app-line)",
        className
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <SmartImage src={src} alt={alt} width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        <Megaphone className="text-(--app-accent-ink)" style={{ width: size * 0.45, height: size * 0.45 }} />
      )}
    </span>
  );
}

/** "1,200 pts" plus "≈ $1.20" when the rate is known. */
export function PointsLabel({
  points,
  pointsPerUsd,
  size = "md",
}: {
  points: number;
  pointsPerUsd: number;
  size?: "md" | "lg";
}) {
  const approx = pointsPerUsd > 0 ? usd(points / pointsPerUsd) : null;
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className={cn("font-bold t-in tabular-nums", size === "lg" ? "text-xl" : "text-sm")}>
        {pts(points)} pts
      </span>
      {approx && <span className="t-meta text-(--app-ink-3)">≈ {approx}</span>}
    </span>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
