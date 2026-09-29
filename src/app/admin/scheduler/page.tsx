import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { SCHEDULED_JOBS } from "@/lib/scheduler/jobs";
import { getJobModes } from "@/lib/scheduler/modes";
import { latestRunPerJob } from "@/lib/scheduler/latest";
import {
  SchedulerBoard,
  type RunRow,
} from "@/components/admin/scheduler/scheduler-board";

export const dynamic = "force-dynamic";

/**
 * Where the owner sees the schedule.
 *
 * Nothing on this page is required for the scheduler to work — it runs off site
 * traffic whether anyone looks at this or not. It exists so that "did the
 * leaderboard pay last night" has an answer that is not a log search, and so
 * that a job can be pushed by hand without a secret or a terminal.
 */
export default async function SchedulerAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "settings.view"))) redirect("/admin");

  const [modes, latest] = await Promise.all([getJobModes(), latestRunPerJob()]);
  const runs = (await prisma.scheduledJobRun.findMany({
    orderBy: { claimedAt: "desc" },
    take: 60,
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
  })) as Array<{
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
  }>;

  const rows: RunRow[] = runs.map((r) => ({
    ...r,
    claimedAt: r.claimedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
  }));

  return (
    <SchedulerBoard
      jobs={SCHEDULED_JOBS.map((j) => ({
        name: j.name,
        label: j.label,
        description: j.description,
        intervalMs: j.intervalMs,
        leaseMs: j.leaseMs,
      }))}
      initialRuns={rows}
      initialModes={modes}
      initialLatest={latest}
    />
  );
}
