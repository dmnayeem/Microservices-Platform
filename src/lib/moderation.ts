/**
 * Shared moderation vocabulary and rules.
 *
 * Client-safe (no prisma, no `server-only`) so the admin UI and the report API
 * agree on what a reason, a priority and a resolution mean. They previously did
 * not, and the result was a priority system that did nothing at all:
 *
 *  - the report API bumped priority for `"fraud"`, but the user-facing picker
 *    submits `"scam"` for that option, so scam reports were never urgent;
 *  - `"HIGH"` was never written by anything, leaving a dead branch in the UI;
 *  - the queue sorted `{ priority: "asc" }` on a **String** column, so
 *    alphabetical order put `HIGH` < `NORMAL` < `URGENT` and buried the urgent
 *    ones at the bottom of a list capped at 50 rows.
 */

// ── Content types ───────────────────────────────────────────────────────────

export const REPORT_CONTENT_TYPES = [
  "POST",
  "COMMENT",
  "USER",
  "LISTING",
  "GROUP",
] as const;
export type ReportContentType = (typeof REPORT_CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABEL: Record<string, string> = {
  POST: "Post",
  COMMENT: "Comment",
  USER: "User",
  LISTING: "Marketplace listing",
  GROUP: "Group",
};

// ── Reasons ─────────────────────────────────────────────────────────────────

/**
 * Stored uppercase by the report API. These are the exact values the reporting
 * dialog can produce — the schema comment listing a `FRAUD` reason describes a
 * value nothing has ever written.
 */
export const REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "SCAM",
  "NSFW",
  "VIOLENCE",
  "MISINFORMATION",
  "OTHER",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REASON_LABEL: Record<string, string> = {
  SPAM: "Spam",
  HARASSMENT: "Harassment or hate speech",
  SCAM: "Scam or fraud",
  NSFW: "Adult or sensitive content",
  VIOLENCE: "Violence or self-harm",
  MISINFORMATION: "Misinformation",
  OTHER: "Other",
  // Legacy/unknown values still render rather than showing a raw enum.
  FRAUD: "Scam or fraud",
};

/**
 * Reasons that jump the queue.
 *
 * Matched against the value the picker actually submits. The old list checked
 * for `"fraud"`, which the UI has never sent — so the single most urgent
 * category of report was filed as routine.
 */
const URGENT_REASONS = new Set(["harassment", "violence", "scam", "nsfw"]);

export function priorityForReason(reason: string): ReportPriority {
  return URGENT_REASONS.has(reason.trim().toLowerCase()) ? "URGENT" : "NORMAL";
}

// ── Priority ────────────────────────────────────────────────────────────────

export const REPORT_PRIORITIES = ["URGENT", "HIGH", "NORMAL"] as const;
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

/**
 * Sort weight. `priority` is a String column, so ordering by it in SQL is
 * alphabetical — which is exactly backwards. Queries fetch by filter and sort
 * in memory using this; the page size is bounded, so it costs nothing.
 */
export const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
};

export function priorityRank(p: string): number {
  return PRIORITY_RANK[p] ?? PRIORITY_RANK.NORMAL;
}

export const PRIORITY_LABEL: Record<string, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  NORMAL: "Normal",
};

// ── Resolutions ─────────────────────────────────────────────────────────────

/**
 * `HIDDEN` is not new — the agency escalation path already writes it. The admin
 * API's enum simply didn't accept it, so those rows couldn't be rendered on the
 * Resolved tab and the "removed" stat undercounted real moderation work.
 */
export const REPORT_RESOLUTIONS = [
  "DISMISSED",
  "WARNED",
  "HIDDEN",
  "DELETED",
  "SUSPENDED",
  "BANNED",
] as const;
export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number];

export const RESOLUTION_LABEL: Record<string, string> = {
  DISMISSED: "Dismissed",
  WARNED: "Author warned",
  HIDDEN: "Content hidden",
  DELETED: "Content deleted",
  SUSPENDED: "User suspended",
  BANNED: "User banned",
};

/**
 * Which resolutions make sense for which content type.
 *
 * The old UI hid the user-level actions for content reports but the API would
 * still accept them, and it *offered* "Delete content" on USER reports, which
 * the API silently ignored. Both sides now read this one map.
 */
export function allowedResolutions(contentType: string): ReportResolution[] {
  switch (contentType) {
    case "POST":
    case "COMMENT":
      // Hide and delete act on the content; warn/suspend/ban act on its author,
      // which the resolver looks up from the content itself.
      return ["DISMISSED", "WARNED", "HIDDEN", "DELETED", "SUSPENDED", "BANNED"];
    case "LISTING":
      // A listing has no `isHidden`; its soft-hide is a status value, and the
      // seller is the user the account actions apply to.
      return ["DISMISSED", "WARNED", "HIDDEN", "DELETED", "SUSPENDED", "BANNED"];
    case "USER":
      // There is no separate content to hide or delete.
      return ["DISMISSED", "WARNED", "SUSPENDED", "BANNED"];
    case "GROUP":
      // Reportable by the API but with no moderation surface behind it. Offer
      // only what actually works rather than buttons that quietly do nothing.
      return ["DISMISSED"];
    default:
      return ["DISMISSED"];
  }
}

/** Resolutions that count as "action taken" for the stats. */
export const ACTIONED_RESOLUTIONS: ReportResolution[] = [
  "WARNED",
  "HIDDEN",
  "DELETED",
  "SUSPENDED",
  "BANNED",
];
