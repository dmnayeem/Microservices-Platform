import "server-only";
import { prisma } from "@/lib/prisma";
import { verifyCodeFor } from "@/lib/task-verify-code";
import { randomBytes } from "crypto";
import { normalizeVisitConfig, VISIT_PASS_TTL_MIN, type VisitConfig } from "@/lib/visit-tasks";

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

// ── Signed-out one-time codes (VisitPass) ────────────────────────────────────

const PASS_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Passes one address may make per hour, across all tasks (reload / farm guard). */
const PASS_PER_IP_HOUR = 20;

/** `P-XXXXXX` as shown; stored without the dash. */
export const displayPass = (code: string) => `${code.slice(0, 1)}-${code.slice(1)}`;

/**
 * Issue (or reuse) a one-time code for a signed-out arrival on /v/[taskId].
 * Reloading the page shows the same unused code instead of minting another.
 */
export async function issueVisitPass(input: {
  taskId: string;
  verdict: string;
  referrerHost: string | null;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ code: string } | { error: "RATE_LIMITED" }> {
  const since = new Date(Date.now() - VISIT_PASS_TTL_MIN * 60_000);
  if (input.ip) {
    const reuse = await prisma.visitPass.findFirst({
      where: { taskId: input.taskId, ip: input.ip, usedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { code: true },
    });
    if (reuse) return { code: reuse.code };
    const recent = await prisma.visitPass.count({
      where: { ip: input.ip, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= PASS_PER_IP_HOUR) return { error: "RATE_LIMITED" };
  }
  for (let i = 0; i < 4; i++) {
    const bytes = randomBytes(6);
    const code = "P" + Array.from(bytes, (b) => PASS_ALPHABET[b % PASS_ALPHABET.length]).join("");
    try {
      await prisma.visitPass.create({
        data: {
          code,
          taskId: input.taskId,
          verdict: input.verdict,
          referrerHost: input.referrerHost,
          ip: input.ip,
          userAgent: input.userAgent?.slice(0, 300) ?? null,
        },
      });
      return { code };
    } catch {
      // unique clash on `code` — try another
    }
  }
  throw new Error("Couldn't make a visit code");
}

/**
 * Redeem a one-time code for this user's attempt. It must have been made after
 * the user opened the link from the task, no faster than `minSeconds`, within
 * the TTL, and not used by anyone else. Burns it (CAS) and records the arrival
 * on the user's visit, so evidence and counts look like a signed-in arrival.
 */
export async function redeemVisitPass(input: {
  taskId: string;
  code: string;
  userId: string;
  submissionId: string;
  minSeconds: number;
}): Promise<
  | { ok: true; verdict: string; referrerHost: string | null; elapsedSec: number }
  | { ok: false; error: string; code: string }
> {
  const pass = await prisma.visitPass.findFirst({
    where: {
      taskId: input.taskId,
      code: input.code,
      OR: [{ usedAt: null }, { submissionId: input.submissionId }],
    },
  });
  if (!pass) {
    return { ok: false, code: "VISIT_BAD_CODE", error: "That code isn't right, or it was already used." };
  }
  if (!pass.usedAt && pass.createdAt.getTime() < Date.now() - VISIT_PASS_TTL_MIN * 60_000) {
    return { ok: false, code: "VISIT_PASS_EXPIRED", error: "That code has expired. Open the link again from the task." };
  }
  const visit = await prisma.taskVisit.findFirst({
    where: { submissionId: input.submissionId, userId: input.userId, kind: "SHORTENER", openedAt: { lte: pass.createdAt } },
    orderBy: { openedAt: "desc" },
  });
  if (!visit) {
    return {
      ok: false,
      code: "VISIT_PASS_BEFORE_OPEN",
      error: "That code was made before you opened the link from this task. Press Open link and go through it again.",
    };
  }
  const elapsedSec = Math.floor((pass.createdAt.getTime() - visit.openedAt.getTime()) / 1000);
  if (elapsedSec < input.minSeconds) {
    return {
      ok: false,
      code: "VISIT_TOO_FAST",
      error: "You got through the link faster than it allows. Open it again and go through every step.",
    };
  }
  if (!pass.usedAt) {
    const burned = await prisma.visitPass.updateMany({
      where: { id: pass.id, usedAt: null },
      data: { usedAt: new Date(), usedByUserId: input.userId, submissionId: input.submissionId },
    });
    if (burned.count !== 1) {
      return { ok: false, code: "VISIT_BAD_CODE", error: "That code was already used." };
    }
  }
  await prisma.taskVisit.updateMany({
    where: { id: visit.id, reachedAt: null },
    data: {
      reachedAt: pass.createdAt,
      outcome: "REACHED",
      verdict: pass.verdict,
      referrerHost: pass.referrerHost,
      elapsedSec,
    },
  });
  return { ok: true, verdict: pass.verdict, referrerHost: pass.referrerHost, elapsedSec };
}
