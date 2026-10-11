import "server-only";
import { Prisma, NotificationType, TransactionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { creditPoints } from "@/lib/ledger";
import { requireActiveUser } from "@/lib/require-active";
import { qualifiedReferralCount } from "@/lib/referral-bonus";
import {
  AMBASSADOR_KEY,
  ambassadorBonus,
  monthOf,
  monthRange,
  normalizeAmbassadorConfig,
  type AmbassadorConfig,
} from "@/lib/ambassadors";

type Fail = { ok: false; error: string; status: number };
const fail = (error: string, status = 400): Fail => ({ ok: false, error, status });

export async function getAmbassadorConfig(): Promise<AmbassadorConfig> {
  return normalizeAmbassadorConfig(await getSetting<unknown>(AMBASSADOR_KEY, null));
}

/**
 * New referrals who joined in `month` and are really working: ACTIVE, with at
 * least `qualifyTasks` approved tasks. Fakes and idle sign-ups don't count, and
 * a referral counts in the month they joined only — once.
 */
export async function qualifiedInMonth(ambassadorId: string, month: string, cfg: AmbassadorConfig): Promise<number> {
  const [from, to] = monthRange(month);
  const joined = await prisma.user.findMany({
    where: { referredById: ambassadorId, status: "ACTIVE", createdAt: { gte: from, lt: to } },
    select: { id: true },
    take: 5000,
  });
  if (joined.length === 0) return 0;
  const ids = joined.map((u) => u.id);
  const [done, ambDevices, refDevices] = await Promise.all([
    // Real work only: visit tasks can be scripted, so they don't count.
    prisma.taskSubmission.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, status: { in: ["APPROVED", "AUTO_APPROVED"] }, task: { type: { not: "VISIT" } } },
      _count: { _all: true },
    }) as unknown as Promise<Array<{ userId: string; _count: { _all: number } }>>,
    prisma.userDevice.findMany({ where: { userId: ambassadorId }, select: { deviceId: true, fpHash: true }, take: 50 }),
    prisma.userDevice.findMany({ where: { userId: { in: ids } }, select: { userId: true, deviceId: true, fpHash: true } }),
  ]);
  const ambIds = new Set(ambDevices.map((d) => d.deviceId));
  const ambFps = new Set(ambDevices.map((d) => d.fpHash).filter((f): f is string => !!f));
  const devicesOf = new Map<string, { deviceId: string; fpHash: string | null }[]>();
  for (const d of refDevices) devicesOf.set(d.userId, [...(devicesOf.get(d.userId) ?? []), d]);
  const seenFps = new Set<string>();
  let n = 0;
  for (const d of done) {
    if (d._count._all < cfg.qualifyTasks) continue;
    const devs = devicesOf.get(d.userId) ?? [];
    // The ambassador's own device or browser = their own second account.
    if (devs.some((x) => ambIds.has(x.deviceId) || (x.fpHash && ambFps.has(x.fpHash)))) continue;
    // Several "referrals" on one browser fingerprint count once.
    const fps = devs.map((x) => x.fpHash).filter((f): f is string => !!f);
    if (fps.some((f) => seenFps.has(f))) continue;
    fps.forEach((f) => seenFps.add(f));
    n++;
  }
  return n;
}

/** Can this member apply, and if not, why. */
export async function applyEligibility(userId: string, cfg: AmbassadorConfig): Promise<string | null> {
  if (!cfg.enabled) return "The ambassador program isn't open right now.";
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { level: true, kycStatus: true } });
  if (!user) return "Unauthorized";
  if (user.level < cfg.minLevelToApply) return `Reach level ${cfg.minLevelToApply} to apply.`;
  if (cfg.requireKyc && user.kycStatus !== "APPROVED") return "Verify your identity (KYC) to apply.";
  if (cfg.minReferralsToApply > 0) {
    const n = await qualifiedReferralCount(userId);
    if (n < cfg.minReferralsToApply) return `Bring in ${cfg.minReferralsToApply} active members first (you have ${n}).`;
  }
  return null;
}

export async function applyAsAmbassador(userId: string, message: string | null): Promise<{ ok: true } | Fail> {
  const active = await requireActiveUser(userId);
  if (!active.ok) return fail(active.message, active.httpStatus);
  const cfg = await getAmbassadorConfig();
  const why = await applyEligibility(userId, cfg);
  if (why) return fail(why);
  const existing = await prisma.ambassadorApplication.findUnique({ where: { userId } });
  if (existing && existing.status !== "REJECTED") {
    return fail(existing.status === "APPROVED" ? "You're already an ambassador." : "Your application is being reviewed.");
  }
  try {
    await prisma.ambassadorApplication.upsert({
      where: { userId },
      create: { userId, message: message?.trim().slice(0, 1000) || null },
      update: { status: "PENDING", message: message?.trim().slice(0, 1000) || null, adminNote: null, decidedAt: null },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("Your application is being reviewed.");
    throw e;
  }
  return { ok: true };
}

/**
 * Pay one month's ambassador bonus to every approved ambassador (once each —
 * AmbassadorPayout is unique on member + month, written in the same
 * transaction as the credit). Safe to run again.
 */
export async function payAmbassadorMonth(month: string): Promise<{ paid: number; points: number; skipped: number }> {
  const cfg = await getAmbassadorConfig();
  const out = { paid: 0, points: 0, skipped: 0 };
  const ambassadors = await prisma.ambassadorApplication.findMany({ where: { status: "APPROVED" }, select: { userId: true } });
  for (const { userId } of ambassadors) {
    const already = await prisma.ambassadorPayout.findUnique({ where: { userId_month: { userId, month } }, select: { id: true } });
    if (already) {
      out.skipped++;
      continue;
    }
    const active = await requireActiveUser(userId);
    if (!active.ok) {
      out.skipped++;
      continue;
    }
    const qualified = await qualifiedInMonth(userId, month, cfg);
    const points = ambassadorBonus(cfg, qualified);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.ambassadorPayout.create({ data: { userId, month, qualified, points } });
        if (points > 0) {
          await creditPoints(tx, {
            userId,
            points,
            type: TransactionType.BONUS,
            description: `Ambassador bonus — ${month} (${qualified} active new member${qualified === 1 ? "" : "s"})`,
            reference: `ambassador_${month}`,
            metadata: { source: "ambassador", month, qualified },
          });
          await tx.notification.create({
            data: {
              userId,
              type: NotificationType.ACHIEVEMENT,
              title: "🎖️ Ambassador bonus",
              message: `${points.toLocaleString()} points for the ${qualified} active member${qualified === 1 ? "" : "s"} you brought in during ${month}. Thank you!`,
              data: { link: "/ambassador" },
            },
          });
        }
      });
      out.paid++;
      out.points += points;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") out.skipped++;
      else throw e;
    }
  }
  return out;
}

/**
 * Scheduler: pays the month before LAST (once) — e.g. October on 1 December.
 * A member who joined on the 30th gets a full month to do their tasks before
 * their month is paid; paying a day after it ended lost them forever.
 */
export async function runAmbassadorPayouts(now = new Date()): Promise<{ month: string; paid: number; points: number; skipped: number }> {
  const last = monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)));
  const cfg = await getAmbassadorConfig();
  if (!cfg.enabled) return { month: last, paid: 0, points: 0, skipped: 0 };
  return { month: last, ...(await payAmbassadorMonth(last)) };
}
