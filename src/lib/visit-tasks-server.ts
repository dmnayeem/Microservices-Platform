import "server-only";
import { prisma } from "@/lib/prisma";
import { verifyCodeFor } from "@/lib/task-verify-code";
import { normalizeVisitConfig, type VisitConfig } from "@/lib/visit-tasks";

/**
 * Server half of VISIT tasks (see lib/visit-tasks.ts for the rules).
 */

/** Separate code space from SOCIAL per-item codes (which use small indexes). */
const VISIT_CODE_INDEX = 7001;

/** The shortener code a user is shown on /v/[taskId] and must enter. */
export function visitCodeFor(taskId: string, userId: string): string {
  return verifyCodeFor(taskId, VISIT_CODE_INDEX, userId);
}

/** Most link opens allowed per attempt (retries after coming back too early). */
export const MAX_OPENS_PER_ATTEMPT = 5;

/** A VISIT task with its normalised config, or null. */
export async function loadVisitTask(taskId: string): Promise<{
  id: string;
  title: string;
  status: string;
  config: VisitConfig;
} | null> {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, type: true, status: true, hidden: true, visitConfig: true },
  });
  if (!t || t.type !== "VISIT" || t.hidden) return null;
  return { id: t.id, title: t.title, status: t.status, config: normalizeVisitConfig(t.visitConfig) };
}

/** The user's attempt in progress on this task (started, not yet sent in). */
export async function openAttempt(taskId: string, userId: string) {
  return prisma.taskSubmission.findFirst({
    where: { taskId, userId, status: "PENDING", submittedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}

/** Evidence for one attempt: its opens and the best result. */
export async function visitEvidence(submissionId: string) {
  const visits = await prisma.taskVisit.findMany({
    where: { submissionId },
    orderBy: { openedAt: "asc" },
    take: 20,
  });
  const done = visits.find((v) => v.outcome === "DONE") ?? null;
  const reached = visits.find((v) => v.outcome === "REACHED") ?? null;
  return { visits, done, reached };
}
