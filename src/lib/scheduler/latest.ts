import { prisma } from "@/lib/prisma";
import { SCHEDULED_JOBS } from "@/lib/scheduler/jobs";

export interface LatestRun {
  id: string;
  job: string;
  windowKey: string;
  state: string;
  attempts: number;
  source: string;
  claimedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  summary: string | null;
  error: string | null;
}

/**
 * The most recent run of every job, for the per-job cards on /admin/scheduler.
 *
 * The "recent runs" list cannot answer this: an every-minute job fills it in an
 * hour, and a daily job's last result falls off the end. One indexed read per
 * job on `@@index([job, claimedAt])`, admin screen only.
 */
export async function latestRunPerJob(): Promise<Record<string, LatestRun>> {
  const rows = await Promise.all(
    SCHEDULED_JOBS.map(
      (j) =>
        prisma.scheduledJobRun.findFirst({
          where: { job: j.name },
          orderBy: { claimedAt: "desc" },
          select: {
            id: true,
            job: true,
            windowKey: true,
            state: true,
            attempts: true,
            source: true,
            claimedAt: true,
            finishedAt: true,
            durationMs: true,
            summary: true,
            error: true,
          },
        }) as Promise<{
          id: string;
          job: string;
          windowKey: string;
          state: string;
          attempts: number;
          source: string;
          claimedAt: Date;
          finishedAt: Date | null;
          durationMs: number | null;
          summary: string | null;
          error: string | null;
        } | null>
    )
  );
  const out: Record<string, LatestRun> = {};
  for (const r of rows) {
    if (!r) continue;
    out[r.job] = {
      ...r,
      claimedAt: r.claimedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    };
  }
  return out;
}
