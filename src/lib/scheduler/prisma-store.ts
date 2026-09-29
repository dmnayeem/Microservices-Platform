import { prisma } from "@/lib/prisma";
import type { ClaimState, ClaimStore } from "@/lib/scheduler/claim";

/** Prisma-backed store. The only one used at runtime. */
export const prismaClaimStore: ClaimStore = {
  async insert(row) {
    try {
      await prisma.scheduledJobRun.create({
        data: {
          job: row.job,
          windowKey: row.windowKey,
          source: row.source,
          state: "running",
          leaseUntil: row.leaseUntil,
        },
      });
      return true;
    } catch {
      // Unique violation — somebody else owns this window. Any other write
      // error is also "we did not get it", which is the safe reading.
      return false;
    }
  },

  async get(job, windowKey) {
    const row = (await prisma.scheduledJobRun.findUnique({
      where: { job_windowKey: { job, windowKey } },
      select: { job: true, windowKey: true, state: true, attempts: true, leaseUntil: true },
    })) as {
      job: string;
      windowKey: string;
      state: string;
      attempts: number;
      leaseUntil: Date;
    } | null;
    if (!row) return null;
    return {
      job: row.job,
      windowKey: row.windowKey,
      state: row.state as ClaimState,
      attempts: row.attempts,
      leaseUntil: row.leaseUntil,
    };
  },

  async takeOver(job, windowKey, now, leaseUntil) {
    const res = await prisma.scheduledJobRun.updateMany({
      where: {
        job,
        windowKey,
        state: { not: "completed" },
        leaseUntil: { lt: now },
      },
      data: {
        state: "running",
        leaseUntil,
        claimedAt: now,
        attempts: { increment: 1 },
        error: null,
      },
    });
    return res.count;
  },

  async liveJobs(now) {
    const rows = (await prisma.scheduledJobRun.findMany({
      where: { state: "running", leaseUntil: { gt: now } },
      select: { job: true },
    })) as Array<{ job: string }>;
    return new Set(rows.map((r) => r.job));
  },

  async finish(job, windowKey, patch) {
    await prisma.scheduledJobRun.updateMany({
      where: { job, windowKey },
      data: {
        state: patch.ok ? "completed" : "failed",
        finishedAt: new Date(),
        durationMs: patch.durationMs,
        summary: patch.summary ?? null,
        error: patch.error ?? null,
        // A failure hands the window back after a short backoff instead of
        // pinning it until the full lease runs out.
        leaseUntil: patch.ok ? new Date() : patch.retryAt,
        result:
          patch.result == null
            ? undefined
            : (JSON.parse(JSON.stringify(patch.result)) as object),
      },
    });
  },
};
