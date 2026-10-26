/**
 * Team Work — the vocabulary and the arithmetic. Pure: no database, safe in
 * client components. Statuses are plain strings in the schema; this file is
 * the only list of what they may be.
 */

export const WORK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type WorkPriority = (typeof WORK_PRIORITIES)[number];

export const TASK_STATUSES = [
  "DRAFT",
  "ASSIGNED",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "COMPLETED",
  "CANCELLED",
  "ARCHIVED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses in which work still has to be done (overdue can only apply here). */
export const OPEN_TASK_STATUSES: TaskStatus[] = ["ASSIGNED", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "CHANGES_REQUESTED"];
export const CLOSED_TASK_STATUSES: TaskStatus[] = ["COMPLETED", "CANCELLED", "ARCHIVED"];

/**
 * Allowed moves. Who may make them is decided by the API (assignees start,
 * block and submit; managers complete, cancel, reopen). COMPLETED is reopened
 * only by a manager, with a reason — never silently.
 */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  DRAFT: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "IN_REVIEW", "COMPLETED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  IN_REVIEW: ["COMPLETED", "CHANGES_REQUESTED", "IN_PROGRESS", "CANCELLED"],
  CHANGES_REQUESTED: ["IN_PROGRESS", "IN_REVIEW", "BLOCKED", "CANCELLED"],
  COMPLETED: ["IN_PROGRESS", "ARCHIVED"],
  CANCELLED: ["ASSIGNED", "ARCHIVED"],
  ARCHIVED: [],
};

export function canTransition(from: string, to: string): boolean {
  return (TASK_TRANSITIONS[from as TaskStatus] ?? []).includes(to as TaskStatus);
}

export const TASK_VISIBILITY = ["PARTICIPANTS", "TEAM", "ALL_STAFF"] as const;
export type TaskVisibility = (typeof TASK_VISIBILITY)[number];

export const MEMBER_ROLES = ["ASSIGNEE", "COLLABORATOR", "REVIEWER", "OBSERVER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const TARGET_MODES = ["SHARED", "INDIVIDUAL"] as const;
export const REPORT_STATUSES = ["SUBMITTED", "APPROVED", "REJECTED", "CHANGES_REQUESTED"] as const;
export const MILESTONE_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "BLOCKED", "IN_REVIEW", "COMPLETED", "CANCELLED"] as const;
export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"] as const;
export const OPTION_KINDS = ["DEPARTMENT", "CATEGORY", "PLATFORM", "UNIT", "POSITION"] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];
export const REQUEST_KINDS = ["UPDATE", "REMINDER", "CLARIFICATION"] as const;

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  ARCHIVED: "Archived",
  NOT_STARTED: "Not started",
  AT_RISK: "At risk",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  SUBMITTED: "Awaiting review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const VISIBILITY_LABEL: Record<TaskVisibility, string> = {
  PARTICIPANTS: "Only the people on this task",
  TEAM: "The task's team",
  ALL_STAFF: "All staff with Team Work",
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  ASSIGNEE: "Assignee",
  COLLABORATOR: "Collaborator",
  REVIEWER: "Reviewer",
  OBSERVER: "Observer",
};

export const taskCode = (n: number) => `TW-${n}`;
export const projectCode = (n: number) => `PRJ-${n}`;

/** Overdue is an indicator on top of the status, never a status itself. */
export function isOverdue(status: string, dueAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!dueAt) return false;
  if (!OPEN_TASK_STATUSES.includes(status as TaskStatus)) return false;
  return new Date(dueAt).getTime() < now.getTime();
}

// ── Progress ─────────────────────────────────────────────────────────────────

export interface TargetProgress {
  targetId: string;
  label: string;
  unitLabel: string;
  quantity: number;
  originalQuantity: number;
  assigneeId: string | null;
  /** Sum of APPROVED report lines. The only number that counts. */
  approved: number;
  /** Sum of SUBMITTED (not yet reviewed) report lines — shown apart. */
  pending: number;
  remaining: number;
  /** 0–100, capped. */
  percent: number;
  /** Approved beyond the target (kept visible, not lost). */
  over: number;
}

/**
 * remaining = max(target − approved, 0); percent = approved ÷ target, capped
 * at 100. A zero or missing target is "nothing to measure": 0% unless work was
 * approved, then 100%.
 */
export function targetProgress(
  t: { id: string; label: string; unitLabel: string; quantity: number; originalQuantity: number; assigneeId: string | null },
  approved: number,
  pending: number
): TargetProgress {
  const q = Math.max(0, Math.floor(t.quantity || 0));
  const a = Math.max(0, Math.floor(approved || 0));
  const remaining = Math.max(q - a, 0);
  const percent = q > 0 ? Math.min(100, Math.floor((a / q) * 100)) : a > 0 ? 100 : 0;
  return {
    targetId: t.id,
    label: t.label,
    unitLabel: t.unitLabel,
    quantity: q,
    originalQuantity: t.originalQuantity,
    assigneeId: t.assigneeId,
    approved: a,
    pending: Math.max(0, Math.floor(pending || 0)),
    remaining,
    percent,
    over: Math.max(a - q, 0),
  };
}

/**
 * A task's overall percent. Different units are never added together (a post
 * is not a video), so the overall figure is the AVERAGE of each target's
 * percent — every target weighs the same. Stated wherever it is shown.
 */
export function overallPercent(targets: TargetProgress[]): number {
  if (targets.length === 0) return 0;
  return Math.floor(targets.reduce((s, t) => s + t.percent, 0) / targets.length);
}

export const OVERALL_METHOD_NOTE = "Overall = the average of each target's completion (different units are never added together).";
