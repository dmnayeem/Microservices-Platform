"use client";

import { cn } from "@/lib/utils";
import { AD_PLACEMENTS } from "@/lib/ad-placements";
import type { AdTargeting } from "@/lib/ad-targeting";

/** Shared status/targeting presentation for every ad admin surface. */

/** Placement name → human label, derived from the canonical catalog. */
export const PLACEMENT_LABELS: Record<string, string> = Object.fromEntries(
  AD_PLACEMENTS.map((p) => [p.name, p.label])
);

const STATUS_CLS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-400",
  PAUSED: "bg-amber-500/15 text-amber-400",
  PENDING: "bg-amber-500/15 text-amber-400",
  CHANGES_REQUESTED: "bg-orange-500/15 text-orange-400",
  REJECTED: "bg-red-500/15 text-red-400",
  INACTIVE: "bg-slate-800 text-slate-400",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending review",
  CHANGES_REQUESTED: "Changes requested",
};

export function StatusPill({ status }: { status: string }) {
  const s = (status ?? "").toUpperCase();
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
        STATUS_CLS[s] ?? "bg-slate-800 text-slate-400"
      )}
    >
      {STATUS_LABEL[s] ?? s}
    </span>
  );
}

/** Short human summary of an ad's targeting, or null when it targets everyone. */
export function targetingSummary(t: AdTargeting | null): string | null {
  if (!t) return null;
  const parts: string[] = [];
  if (t.countries?.length) parts.push(t.countries.join("/"));
  if (t.divisions?.length) parts.push(t.divisions.join("/"));
  if (t.districts?.length) parts.push(t.districts.join("/"));
  if (t.subDistricts?.length) parts.push(t.subDistricts.join("/"));
  if (t.regions?.length) parts.push(t.regions.join("/"));
  if (t.cities?.length) parts.push(t.cities.join("/"));
  if (t.postalCodes?.length) parts.push(t.postalCodes.join("/"));
  if (t.genders?.length) parts.push(t.genders.map((g) => g[0]).join(""));
  if (t.minAge || t.maxAge) parts.push(`${t.minAge ?? ""}-${t.maxAge ?? ""}y`);
  if (t.minLevel || t.maxLevel) parts.push(`L${t.minLevel ?? ""}-${t.maxLevel ?? ""}`);
  if (t.packages?.length) parts.push(t.packages.join("/"));
  if (t.kycStatuses?.length) parts.push(`KYC:${t.kycStatuses.map((k) => k[0]).join("")}`);
  if (t.verifiedOnly) parts.push("✓verified");
  if (t.tags?.length) parts.push(t.tags.join("/"));
  if (t.languages?.length) parts.push(t.languages.join("/"));
  if (t.minAccountAgeDays) parts.push(`${t.minAccountAgeDays}d+ old`);
  if (t.activeWithinDays) parts.push(`active ${t.activeWithinDays}d`);
  return parts.length ? parts.join(" · ") : null;
}

/** Every targeting rule as its own labelled chip — a reviewer has to be able to
 *  read the audience, not squint at a compressed one-liner. */
export function targetingChips(t: AdTargeting | null): { label: string; value: string }[] {
  if (!t) return [];
  const out: { label: string; value: string }[] = [];
  const list = (label: string, v?: string[]) => {
    if (v?.length) out.push({ label, value: v.join(", ") });
  };
  list("Countries", t.countries);
  list("Regions", t.regions);
  list("Divisions", t.divisions);
  list("Districts", t.districts);
  list("Upazilas", t.subDistricts);
  list("Cities", t.cities);
  list("Postal codes", t.postalCodes);
  list("Gender", t.genders);
  list("Plans", t.packages);
  list("KYC", t.kycStatuses);
  list("Interests", t.tags);
  list("Languages", t.languages);
  if (t.minAge || t.maxAge)
    out.push({ label: "Age", value: `${t.minAge ?? "any"} – ${t.maxAge ?? "any"}` });
  if (t.minLevel || t.maxLevel)
    out.push({ label: "Level", value: `${t.minLevel ?? "any"} – ${t.maxLevel ?? "any"}` });
  if (t.minAccountAgeDays)
    out.push({ label: "Account age", value: `${t.minAccountAgeDays}+ days` });
  if (t.activeWithinDays)
    out.push({ label: "Active within", value: `${t.activeWithinDays} days` });
  if (t.verifiedOnly) out.push({ label: "Verified only", value: "Yes" });
  return out;
}

/** "3h 20m" style age, for "waiting in queue since". */
export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
