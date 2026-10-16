import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { sendApplicationDecision } from "@/lib/application-decision";
import { contestAdminGuard as communityGuard } from "@/lib/contests-admin";
import { AMBASSADOR_KEY, ambassadorBonus, monthOf, normalizeAmbassadorConfig } from "@/lib/ambassadors";
import { getAmbassadorConfig, payAmbassadorMonth, qualifiedInMonth } from "@/lib/ambassadors-server";

/**
 * GET   — settings, every application (with this month's progress for
 *         approved ambassadors) and recent payouts.
 * PUT   — `{ config }`: save the settings.
 * PATCH — `{ userId, status: APPROVED|REJECTED|REMOVED, adminNote? }`.
 * POST  — `{ month: "YYYY-MM" }`: pay that month now (once per ambassador).
 */
export async function GET() {
  const g = await communityGuard("community.view");
  if ("res" in g) return g.res;
  const cfg = await getAmbassadorConfig();
  const apps = await prisma.ambassadorApplication.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 500 });
  const users = await prisma.user.findMany({
    where: { id: { in: apps.map((a) => a.userId) } },
    select: { id: true, name: true, email: true, level: true, kycStatus: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const month = monthOf(new Date());
  const rows = await Promise.all(
    apps.map(async (a) => {
      const q = a.status === "APPROVED" ? await qualifiedInMonth(a.userId, month, cfg) : null;
      return { ...a, user: byId.get(a.userId) ?? null, thisMonth: q, projected: q == null ? null : ambassadorBonus(cfg, q) };
    })
  );
  const payouts = await prisma.ambassadorPayout.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ config: cfg, month, applications: rows, payouts });
}

export async function PUT(request: NextRequest) {
  const g = await communityGuard("community.manage");
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as { config?: unknown };
  const cfg = normalizeAmbassadorConfig(body.config);
  await saveSetting(AMBASSADOR_KEY, cfg, "community");
  await writeAudit({
    actorId: g.userId,
    action: "AMBASSADOR_SETTINGS_SET",
    entity: "SystemSetting",
    entityId: AMBASSADOR_KEY,
    summary: `Ambassador program ${cfg.enabled ? "on" : "off"}: ${cfg.pointsPerReferral} pts per active referral, target ${cfg.monthlyTarget} → +${cfg.targetBonus}`,
  });
  return NextResponse.json({ ok: true, config: cfg });
}

export async function PATCH(request: NextRequest) {
  const g = await communityGuard("community.manage");
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as { userId?: unknown; status?: unknown; adminNote?: unknown };
  const status = body.status === "APPROVED" || body.status === "REJECTED" || body.status === "REMOVED" ? body.status : null;
  if (!status) return NextResponse.json({ error: "Pick a status." }, { status: 400 });
  const userId = String(body.userId ?? "");
  const r = await prisma.ambassadorApplication.updateMany({
    where: { userId },
    data: { status, adminNote: body.adminNote ? String(body.adminNote).slice(0, 500) : null, decidedAt: new Date() },
  });
  if (r.count === 0) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  await prisma.notification.create({
    data: {
      userId,
      type: "SYSTEM",
      title: status === "APPROVED" ? "🎖️ You're a RevType Ambassador!" : status === "REJECTED" ? "Ambassador application" : "Ambassador status",
      message:
        status === "APPROVED"
          ? "Welcome aboard. Bring in active members and earn a monthly ambassador bonus — see your progress on the Ambassador page."
          : status === "REJECTED"
            ? `Your application wasn't approved this time.${body.adminNote ? ` ${String(body.adminNote).slice(0, 300)}` : ""}`
            : "You are no longer in the ambassador program.",
      data: { link: "/ambassador" },
    },
  });
  if (status !== "REMOVED") {
    sendApplicationDecision({
      userId,
      program: "Ambassador",
      approved: status === "APPROVED",
      adminNote: body.adminNote ? String(body.adminNote).slice(0, 500) : null,
      link: "/ambassador",
    });
  }
  await writeAudit({ actorId: g.userId, action: `AMBASSADOR_${status}`, entity: "AmbassadorApplication", entityId: userId, targetUserId: userId, summary: `Ambassador application → ${status}` });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const g = await communityGuard("community.manage");
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as { month?: unknown };
  const month = String(body.month ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "Month as YYYY-MM." }, { status: 400 });
  if (month >= monthOf(new Date())) return NextResponse.json({ error: "Only a finished month can be paid." }, { status: 400 });
  const r = await payAmbassadorMonth(month);
  await writeAudit({ actorId: g.userId, action: "AMBASSADOR_MONTH_PAID", entity: "AmbassadorPayout", entityId: month, summary: `Ambassador bonus ${month}: ${r.paid} paid, ${r.points} pts` });
  return NextResponse.json({ ok: true, ...r });
}
