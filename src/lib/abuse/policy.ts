/**
 * Abuse Center rules that need no database — so the verify script can check
 * them directly: how signals fold into one case, how severities compare, which
 * actions exist, and the provider-response text.
 */
import type { AbuseSeverity, AbuseSignal } from "./signal";

export const CASE_STATUSES = ["OPEN", "ACTIONED", "RESOLVED", "DISMISSED"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const SEVERITIES: AbuseSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const EVIDENCE_KINDS = ["SIGNAL", "SNAPSHOT", "NOTE", "ACTION"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export function severityRank(s: string | null | undefined): number {
  const i = SEVERITIES.indexOf(s as AbuseSeverity);
  return i < 0 ? 1 : i;
}

export function maxSeverity(a: string, b: string): AbuseSeverity {
  return (severityRank(a) >= severityRank(b) ? a : b) as AbuseSeverity;
}

/** Severities strictly below `s` — used for "raise, never lower" updates. */
export function severitiesBelow(s: string): AbuseSeverity[] {
  return SEVERITIES.slice(0, severityRank(s));
}

/**
 * The dedup key of an OPEN case. Two signals about the same thing by the same
 * account land on one case; a different kind, account or item opens another.
 * Entity type is case-folded so "post" and "POST" do not split a case.
 * Returns null when there is no account and no item — no dedup then.
 */
export function openKeyFor(s: Pick<AbuseSignal, "kind" | "userId" | "entityType" | "entityId">): string | null {
  // Nothing to tie it to (e.g. a public report naming no account or item):
  // every such signal is its own case, or unrelated complaints would merge.
  if (!s.userId && !s.entityId) return null;
  const parts = [
    s.kind,
    s.userId ?? "",
    (s.entityType ?? "").toLowerCase(),
    s.entityId ?? "",
  ];
  // Plain text, not a hash: readable in the table, and this file stays
  // importable from the browser (the provider-response tab uses it).
  return parts.join("|").slice(0, 300);
}

/** A user report's priority, as a signal severity. */
export function severityForReportPriority(p: string | null | undefined): AbuseSeverity {
  if (p === "URGENT") return "HIGH";
  if (p === "HIGH") return "MEDIUM";
  return "LOW";
}

/* ── Settings ─────────────────────────────────────────────────────────── */

export const ABUSE_SETTING_KEYS = {
  email: "security.abuse_email",
  autoHideOnCritical: "security.auto_hide_on_critical",
  autoSuspendOnCritical: "security.auto_suspend_on_critical",
  notifyAdmins: "security.abuse_notify_admins",
} as const;

export const ABUSE_DEFAULTS = {
  email: "abuse@revtype.com",
  // Hiding ONE item is reversible and costs nothing if it was a false alarm.
  autoHideOnCritical: true,
  // Suspending an account is not something a scanner should do on its own.
  autoSuspendOnCritical: false,
  notifyAdmins: true,
} as const;

/* ── Actions ──────────────────────────────────────────────────────────── */

export const ABUSE_ACTIONS = {
  preserve_evidence: { label: "Preserve evidence (snapshot)", restoreOf: null, needsUser: true },
  suspend_user: { label: "Suspend account (appealable)", restoreOf: null, needsUser: true },
  ban_user: { label: "Ban account", restoreOf: null, needsUser: true },
  restore_user: { label: "Restore account to active", restoreOf: "suspend_user", needsUser: true },
  hide_content: { label: "Hide all their feed posts and comments", restoreOf: null, needsUser: true },
  restore_content: { label: "Un-hide what this case hid", restoreOf: "hide_content", needsUser: true },
  unpublish_listings: { label: "Unpublish their marketplace listings", restoreOf: null, needsUser: true },
  restore_listings: { label: "Re-publish listings this case unpublished", restoreOf: "unpublish_listings", needsUser: true },
  pause_ads: { label: "Pause their ads", restoreOf: null, needsUser: true },
  resume_ads: { label: "Resume ads this case paused", restoreOf: "pause_ads", needsUser: true },
  pause_tasks: { label: "Pause tasks they created or fund", restoreOf: null, needsUser: true },
  resume_tasks: { label: "Resume tasks this case paused", restoreOf: "pause_tasks", needsUser: true },
  hold_withdrawals: { label: "Hold their withdrawals (no money moves)", restoreOf: null, needsUser: true },
  release_withdrawals: { label: "Release the withdrawal hold", restoreOf: "hold_withdrawals", needsUser: true },
  hide_item: { label: "Hide only the reported item", restoreOf: null, needsUser: false },
} as const;

export type AbuseAction = keyof typeof ABUSE_ACTIONS;

export function isAbuseAction(a: unknown): a is AbuseAction {
  return typeof a === "string" && Object.prototype.hasOwnProperty.call(ABUSE_ACTIONS, a);
}

/** Account-level actions that need `users.ban` on top of the center's own permission. */
export const ACCOUNT_ACTIONS: AbuseAction[] = ["suspend_user", "ban_user", "restore_user"];

/* ── Provider response ────────────────────────────────────────────────── */

export interface ProviderResponseInput {
  platform: string;
  contactEmail: string;
  providerRef?: string | null;
  caseId: string;
  reported: string;
  found: string;
  actions: Array<{ at: Date | string; label: string; detail?: string }>;
  now?: Date;
}

const iso = (d: Date | string) => new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";

/** Plain-text reply to a host / network / advertiser complaint. */
export function providerResponseText(i: ProviderResponseInput): string {
  const lines: string[] = [];
  lines.push(`Subject: ${i.providerRef ? `[${i.providerRef}] ` : ""}Abuse report — actions taken (case ${i.caseId})`);
  lines.push("");
  lines.push("Hello,");
  lines.push("");
  lines.push(`Thank you for your report${i.providerRef ? ` (reference ${i.providerRef})` : ""}. Here is what ${i.platform} found and did.`);
  lines.push("");
  lines.push("What was reported:");
  lines.push(i.reported.trim() || "-");
  lines.push("");
  lines.push("What we found:");
  lines.push(i.found.trim() || "-");
  lines.push("");
  lines.push("Actions taken:");
  if (i.actions.length === 0) lines.push("- None yet.");
  for (const a of i.actions) lines.push(`- ${iso(a.at)}: ${a.label}${a.detail ? ` (${a.detail})` : ""}`);
  lines.push("");
  lines.push("Logs and evidence for this case have been preserved and are available to you or to the authorities on request.");
  lines.push("");
  lines.push(`Contact: ${i.contactEmail}`);
  lines.push(`Sent: ${iso(i.now ?? new Date())}`);
  return lines.join("\n");
}
