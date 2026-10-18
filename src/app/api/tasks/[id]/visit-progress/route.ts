import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireActiveUser } from "@/lib/require-active";
import { loadVisitTask } from "@/lib/visit-tasks-server";
import { VISIT_MAX_CLICKS } from "@/lib/visit-tasks";

/**
 * POST /api/tasks/:id/visit-progress { submissionId, scrollPercent, clicks }
 * — the in-app viewer's heartbeat for a DIRECT visit task set to
 * `viewer: "inapp"` (lib/visit-tasks.ts).
 *
 * Closes the member's latest in-app open (TaskVisit with viewer "inapp", made
 * by /go/task/:id?inapp=1) on this PENDING attempt once every step is met:
 *   - time: server now − openedAt ≥ staySeconds — measured with the SERVER's
 *     clock, so it is the one hard check;
 *   - scroll % and clicks: REPORTED by the viewer. The page in the frame is
 *     another site, so they can't be verified from here; they are kept as
 *     best-so-far (never go down) and clamped, and they gate DONE, but a
 *     scripted client could send them. Treat them as a guide, not proof.
 * The close is a CAS on outcome OPEN → DONE (as visit-return does), so two
 * racing calls write once. Paying still happens only through submit.
 *
 * Response: { outcome: "OPEN" | "DONE", elapsedSec,
 *             need: { seconds, scrollPercent, clicks },
 *             have: { seconds, scrollPercent, clicks } }
 * Errors: 401, 403 (blocked account), 404 (not an in-app visit task / no
 * attempt / VISIT_NOT_OPEN = no in-app open yet), 429.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // A viewer heartbeat every ~2s plus a send on each step is well under this.
  const rl = rateLimit(`visit_progress:${userId}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many updates. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }
  const active = await requireActiveUser(userId);
  if (!active.ok) return NextResponse.json({ error: active.message, code: active.status }, { status: active.httpStatus });

  const body = (await request.json().catch(() => ({}))) as {
    submissionId?: unknown;
    scrollPercent?: unknown;
    clicks?: unknown;
  };
  const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";

  const task = await loadVisitTask(id);
  if (!task || task.status !== "ACTIVE" || task.config.kind !== "DIRECT" || task.config.viewer !== "inapp") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const need = {
    seconds: task.config.staySeconds,
    scrollPercent: task.config.scrollPercent,
    clicks: task.config.clicks,
  };

  const attempt = submissionId
    ? await prisma.taskSubmission.findFirst({
        where: { id: submissionId, taskId: id, userId, status: "PENDING", submittedAt: null },
        select: { id: true },
      })
    : null;
  if (!attempt) return NextResponse.json({ error: "No attempt in progress.", code: "NO_ATTEMPT" }, { status: 404 });

  const clamp = (v: unknown, max: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
  };
  const reportedScroll = clamp(body.scrollPercent, 100);
  const reportedClicks = clamp(body.clicks, VISIT_MAX_CLICKS);

  const visitSelect = { id: true, openedAt: true, elapsedSec: true, scrollPct: true, clicks: true } as const;

  // Already finished in the viewer on this attempt — a late heartbeat is harmless.
  const done = await prisma.taskVisit.findFirst({
    where: { submissionId: attempt.id, userId, taskId: id, outcome: "DONE", viewer: "inapp" },
    orderBy: { openedAt: "desc" },
    select: visitSelect,
  });
  if (done) {
    const secs = done.elapsedSec ?? need.seconds;
    return NextResponse.json({
      outcome: "DONE",
      elapsedSec: secs,
      need,
      have: { seconds: secs, scrollPercent: done.scrollPct ?? 0, clicks: done.clicks ?? 0 },
    });
  }

  const open = await prisma.taskVisit.findFirst({
    where: { submissionId: attempt.id, userId, taskId: id, outcome: "OPEN", viewer: "inapp" },
    orderBy: { openedAt: "desc" },
    select: visitSelect,
  });
  if (!open) {
    return NextResponse.json({ error: "Open the link in the viewer first.", code: "VISIT_NOT_OPEN" }, { status: 404 });
  }

  const now = new Date();
  const elapsedSec = Math.max(0, Math.floor((now.getTime() - open.openedAt.getTime()) / 1000));
  // Best so far: a report never lowers what was already reached.
  const scrollPercent = Math.max(open.scrollPct ?? 0, reportedScroll);
  const clicks = Math.max(open.clicks ?? 0, reportedClicks);
  const have = { seconds: elapsedSec, scrollPercent, clicks };

  const met = elapsedSec >= need.seconds && scrollPercent >= need.scrollPercent && clicks >= need.clicks;
  if (met) {
    // Only the first call closes this open (CAS on OPEN).
    const closed = await prisma.taskVisit.updateMany({
      where: { id: open.id, outcome: "OPEN" },
      data: { outcome: "DONE", returnedAt: now, elapsedSec, scrollPct: scrollPercent, clicks },
    });
    if (closed.count === 1) return NextResponse.json({ outcome: "DONE", elapsedSec, need, have });
    // Lost the race — report what the winner wrote.
    const after = await prisma.taskVisit.findUnique({ where: { id: open.id }, select: { outcome: true, ...visitSelect } });
    if (after?.outcome === "DONE") {
      const secs = after.elapsedSec ?? elapsedSec;
      return NextResponse.json({
        outcome: "DONE",
        elapsedSec: secs,
        need,
        have: { seconds: secs, scrollPercent: after.scrollPct ?? scrollPercent, clicks: after.clicks ?? clicks },
      });
    }
    return NextResponse.json({ outcome: "OPEN", elapsedSec, need, have });
  }

  // Not there yet: keep the best-so-far steps (write only when they moved).
  if (scrollPercent !== (open.scrollPct ?? 0) || clicks !== (open.clicks ?? 0)) {
    await prisma.taskVisit.updateMany({
      where: { id: open.id, outcome: "OPEN" },
      data: { scrollPct: scrollPercent, clicks, elapsedSec },
    });
  }
  return NextResponse.json({ outcome: "OPEN", elapsedSec, need, have });
}
