import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/require-active";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { publicOrigin } from "@/lib/public-origin";
import { assertPageVisible } from "@/lib/page-visibility-server";
import { loadVisitTask, MAX_OPENS_PER_ATTEMPT } from "@/lib/visit-tasks-server";

export const dynamic = "force-dynamic";

/**
 * GET /go/task/:taskId?s=<submissionId> — open a VISIT task's link.
 *
 * Signed-in only; the attempt must be this user's, started and not sent in.
 * Records a TaskVisit with the SERVER's open time (the only clock the stay
 * time is measured with) and 302s to the stored link — the link itself is
 * never sent to the browser before this. Refusals go back to the task page
 * with ?error=REASON (NOT_FOUND, BLOCKED, RATE_LIMITED, NO_ATTEMPT,
 * TOO_MANY_OPENS, BAD_LINK).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const back = (reason: string) =>
    NextResponse.redirect(new URL(`/visit-tasks/${encodeURIComponent(id)}?error=${reason}`, publicOrigin(request)), 302);

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    const login = new URL("/login", publicOrigin(request));
    login.searchParams.set("callbackUrl", `/visit-tasks/${id}`);
    return NextResponse.redirect(login, 302);
  }
  if (await assertPageVisible(userId, "/visit-tasks")) {
    return NextResponse.redirect(new URL("/no-access", publicOrigin(request)), 302);
  }
  const active = await requireActiveUser(userId);
  if (!active.ok) return back("BLOCKED");
  if (enforceRateLimit(request, `visit_go:${userId}`, 30, 60_000)) return back("RATE_LIMITED");

  const task = await loadVisitTask(id);
  if (!task || task.status !== "ACTIVE") return back("NOT_FOUND");

  const submissionId = request.nextUrl.searchParams.get("s") ?? "";
  const attempt = submissionId
    ? await prisma.taskSubmission.findFirst({
        where: { id: submissionId, taskId: id, userId, status: "PENDING", submittedAt: null },
        select: { id: true },
      })
    : null;
  if (!attempt) return back("NO_ATTEMPT");

  const opens = await prisma.taskVisit.count({ where: { submissionId: attempt.id } });
  if (opens >= MAX_OPENS_PER_ATTEMPT) return back("TOO_MANY_OPENS");

  let target: URL;
  try {
    target = new URL(task.config.url);
    if (target.protocol !== "https:" && target.protocol !== "http:") return back("BAD_LINK");
  } catch {
    return back("BAD_LINK");
  }

  await prisma.taskVisit.create({
    data: {
      taskId: id,
      submissionId: attempt.id,
      userId,
      kind: task.config.kind,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
  });

  const res = NextResponse.redirect(target, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
