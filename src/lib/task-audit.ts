/**
 * Who did what to a task.
 *
 * The admin-facing answer to "which admin made this task, and which admin
 * deleted it". Two halves, stored differently on purpose:
 *
 *  - **Created by** lives on the task itself (`Task.createdById`). It is a
 *    property of the task, it is written once, and it should survive as long as
 *    the task does.
 *  - **Everything that happens to the task afterwards** — edits, archives,
 *    deletes, duplicates — lives in `AuditLog`. It has to, because a task with
 *    no submissions is *hard*-deleted, and a `deletedById` column would be
 *    erased by the very delete it exists to record. `AuditLog` is a separate
 *    table, so the record outlives its subject.
 *
 * That is also why the delete event carries a SNAPSHOT rather than just an id:
 * after the row is gone there is nothing left to join to, so "who deleted task
 * cmxyz…" would be unreadable. The snapshot is what makes it say "who deleted
 * *Watch this video, 50 pts*".
 *
 * Client-safe: no server imports, so the admin UI and the API routes share one
 * catalogue instead of two lists that drift.
 */

/** Every lifecycle action recorded against a Task, in the order they read. */
export const TASK_AUDIT_ACTIONS = [
  "TASK_CREATED",
  "TASK_DUPLICATED",
  "TASK_UPDATED",
  "TASK_STATUS_CHANGED",
  "ARTICLE_CONFIG_PATCHED",
  "ARTICLE_KEYS_GENERATED",
  "ARTICLE_KEYS_CLEARED",
  "TASK_REVIEWED",
  "TASK_ARCHIVED",
  "TASK_DELETED",
] as const;

export type TaskAuditAction = (typeof TASK_AUDIT_ACTIONS)[number];

/** Plain-language label for the history panel. */
export const TASK_ACTION_LABEL: Record<string, string> = {
  TASK_CREATED: "Created",
  TASK_DUPLICATED: "Duplicated",
  TASK_UPDATED: "Edited",
  TASK_STATUS_CHANGED: "Status changed",
  ARTICLE_CONFIG_PATCHED: "Article settings changed",
  ARTICLE_KEYS_GENERATED: "Answer keys generated",
  ARTICLE_KEYS_CLEARED: "Answer keys cleared",
  TASK_REVIEWED: "Reviewed",
  TASK_ARCHIVED: "Archived",
  TASK_DELETED: "Deleted",
};

/**
 * Tone for the history row. Removal is red whether or not it was reversible —
 * an admin scanning the list should not have to read the label to notice that
 * a task went away.
 */
export function taskActionTone(action: string): string {
  if (action === "TASK_DELETED") return "text-red-400 bg-red-500/10";
  if (action === "TASK_ARCHIVED") return "text-amber-400 bg-amber-500/10";
  if (action === "TASK_CREATED" || action === "TASK_DUPLICATED")
    return "text-emerald-400 bg-emerald-500/10";
  return "text-blue-400 bg-blue-500/10";
}

/** The two events that mean "this task is no longer in the catalogue". */
export const TASK_REMOVAL_ACTIONS = ["TASK_ARCHIVED", "TASK_DELETED"] as const;

export interface TaskSnapshotSource {
  id: string;
  title: string;
  status: string;
  type: string;
  pointsReward: number;
  xpReward?: number | null;
  completedCount?: number | null;
  createdById?: string | null;
  createdAt?: Date | string | null;
}

/** What a task WAS, captured before it stops existing. */
export interface TaskSnapshot {
  taskId: string;
  title: string;
  type: string;
  status: string;
  pointsReward: number;
  xpReward: number;
  completedCount: number;
  createdById: string | null;
  createdAt: string | null;
}

/**
 * Freeze the parts of a task worth being able to read back later.
 *
 * Deliberately small: enough to recognise the task and judge whether removing
 * it mattered (what it paid, how many people had finished it), not a full copy.
 * A full copy would grow the audit table without making the answer clearer.
 */
export function taskSnapshot(t: TaskSnapshotSource): TaskSnapshot {
  return {
    taskId: t.id,
    title: t.title,
    type: t.type,
    status: t.status,
    pointsReward: t.pointsReward,
    xpReward: t.xpReward ?? 0,
    completedCount: t.completedCount ?? 0,
    createdById: t.createdById ?? null,
    createdAt:
      t.createdAt instanceof Date
        ? t.createdAt.toISOString()
        : (t.createdAt ?? null),
  };
}

/** Read a snapshot back out of an audit row's `newData`, if it has one. */
export function readTaskSnapshot(meta: unknown): TaskSnapshot | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  if (typeof m.taskId !== "string" || typeof m.title !== "string") return null;
  return {
    taskId: m.taskId,
    title: m.title,
    type: typeof m.type === "string" ? m.type : "—",
    status: typeof m.status === "string" ? m.status : "—",
    pointsReward: typeof m.pointsReward === "number" ? m.pointsReward : 0,
    xpReward: typeof m.xpReward === "number" ? m.xpReward : 0,
    completedCount:
      typeof m.completedCount === "number" ? m.completedCount : 0,
    createdById:
      typeof m.createdById === "string" ? m.createdById : null,
    createdAt: typeof m.createdAt === "string" ? m.createdAt : null,
  };
}
