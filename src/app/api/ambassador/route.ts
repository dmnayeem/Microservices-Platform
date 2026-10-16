import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { ambassadorBonus, monthOf } from "@/lib/ambassadors";
import { requirementsRefusal } from "@/lib/application-requirements-server";
import { applyAsAmbassador, applyEligibility, getAmbassadorConfig, qualifiedInMonth } from "@/lib/ambassadors-server";

/**
 * GET  — the program's terms, whether you can apply, your application, this
 *        month's progress and your past bonuses.
 * POST — `{ message? }`: apply.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const cfg = await getAmbassadorConfig();
  const [application, payouts] = await Promise.all([
    prisma.ambassadorApplication.findUnique({ where: { userId }, select: { status: true, adminNote: true, createdAt: true } }),
    prisma.ambassadorPayout.findMany({ where: { userId }, orderBy: { month: "desc" }, take: 12, select: { month: true, qualified: true, points: true } }),
  ]);
  const month = monthOf(new Date());
  const approved = application?.status === "APPROVED";
  const qualified = approved ? await qualifiedInMonth(userId, month, cfg) : 0;
  return NextResponse.json({
    terms: {
      enabled: cfg.enabled,
      minLevelToApply: cfg.minLevelToApply,
      minReferralsToApply: cfg.minReferralsToApply,
      requireKyc: cfg.requireKyc,
      qualifyTasks: cfg.qualifyTasks,
      pointsPerReferral: cfg.pointsPerReferral,
      monthlyTarget: cfg.monthlyTarget,
      targetBonus: cfg.targetBonus,
      monthlyCap: cfg.monthlyCap,
    },
    cannotApply: application && application.status !== "REJECTED" ? null : await applyEligibility(userId, cfg),
    application,
    thisMonth: approved ? { month, qualified, projected: ambassadorBonus(cfg, qualified) } : null,
    payouts,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceDbRateLimit(request, "ambassador-apply", session.user.id, 5, 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { message?: unknown };
  // The Applications center's requirements; applyAsAmbassador still runs the
  // program's own checks (level, KYC, referrals) after this.
  const refusal = await requirementsRefusal(session.user.id, "AMBASSADOR");
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  const r = await applyAsAmbassador(session.user.id, body.message ? String(body.message) : null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
