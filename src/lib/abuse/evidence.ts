import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { EvidenceKind } from "./policy";

/**
 * Evidence is APPEND-ONLY. This file is the only writer of `AbuseEvidence`, and
 * it only ever creates rows — an entry is what the platform knew at the moment
 * it was written, which is exactly what a host, a payment network or the police
 * will ask for later. Nothing in the app updates or deletes one.
 */
export async function addEvidence(
  caseId: string,
  kind: EvidenceKind,
  data: Record<string, unknown>,
  createdById?: string | null
): Promise<void> {
  await prisma.abuseEvidence.create({
    data: {
      caseId,
      kind,
      data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
      createdById: createdById ?? null,
    },
  });
}

const DAYS = 90;
const TAKE = 50;
const clip = (s: string | null | undefined, n = 500) => (s ? (s.length > n ? s.slice(0, n) + "…" : s) : s ?? null);

/**
 * Everything about an account an abuse investigation would want, frozen now:
 * profile basics, what they recently published or created, where they signed
 * in from, what the fraud and audit logs already say, and their money summary.
 *
 * Content is copied (text clipped to 500 characters, media as URLs/keys), so a
 * later edit or removal by the user cannot erase what was there.
 */
export async function snapshotUser(userId: string) {
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const [
    user,
    posts,
    comments,
    listings,
    ads,
    tasks,
    devices,
    activeDays,
    audit,
    fraud,
    txRecent,
    withdrawals,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, username: true, name: true, role: true, status: true,
        country: true, createdAt: true, lastLoginAt: true, signupIp: true, lastIp: true,
        fraudRisk: true, suspendedReason: true, suspendedAt: true, emailVerified: true, phone: true,
      },
    }),
    prisma.post.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, content: true, images: true, isHidden: true, createdAt: true },
    }),
    prisma.comment.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, postId: true, content: true, isHidden: true, createdAt: true },
    }),
    prisma.marketplaceListing.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, title: true, status: true, price: true, assetType: true, createdAt: true },
    }),
    prisma.ad.findMany({
      where: { OR: [{ submittedById: userId }, { campaign: { advertiserId: userId } }] },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, status: true, type: true, targetUrl: true, contentUrl: true, videoUrl: true, createdAt: true, campaign: { select: { id: true, title: true } } },
    }),
    prisma.task.findMany({
      where: { OR: [{ createdById: userId }, { fundedByUserId: userId }] },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, title: true, type: true, status: true, createdAt: true },
    }),
    prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      take: 20,
      select: { deviceId: true, fpHash: true, userAgent: true, lastIp: true, ips: true, country: true, seenCount: true, firstSeenAt: true, lastSeenAt: true },
    }),
    prisma.userActiveDay.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "desc" },
      select: { date: true, firstSeenAt: true },
    }),
    prisma.auditLog.findMany({
      where: { OR: [{ userId }, { targetUserId: userId }], createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, userId: true, action: true, entity: true, entityId: true, summary: true, ipAddress: true, userAgent: true, createdAt: true },
    }),
    prisma.fraudEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, eventType: true, severity: true, status: true, ipAddress: true, userAgent: true, details: true, createdAt: true },
    }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, type: true, status: true, points: true, amount: true, description: true, reference: true, createdAt: true },
    }),
    prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, amount: true, netAmount: true, method: true, status: true, createdAt: true, processedAt: true },
    }),
  ]);

  // groupBy's result type does not survive inference here (same cast as elsewhere).
  const txByType = (await prisma.transaction.groupBy({
    by: ["type"],
    where: { userId, createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { points: true, amount: true },
  })) as unknown as Array<{ type: string; _count: { _all: number }; _sum: { points: number | null; amount: unknown } }>;

  const ips = new Set<string>();
  if (user?.signupIp) ips.add(user.signupIp);
  if (user?.lastIp) ips.add(user.lastIp);
  for (const d of devices) for (const ip of d.ips) ips.add(ip);
  for (const a of audit) if (a.ipAddress && a.userId === userId) ips.add(a.ipAddress);

  return {
    takenAt: new Date().toISOString(),
    windowDays: DAYS,
    user,
    ips: [...ips].slice(0, 50),
    posts: posts.map((p) => ({ ...p, content: clip(p.content) })),
    comments: comments.map((c) => ({ ...c, content: clip(c.content) })),
    listings,
    ads,
    tasks,
    devices,
    activeDays: activeDays.map((d) => ({ date: d.date.toISOString().slice(0, 10), firstSeenAt: d.firstSeenAt })),
    audit,
    fraudEvents: fraud,
    // `Transaction.amount`'s sign is not consistent across write sites, so the
    // summary is per type and as recorded — never netted into one number.
    transactionsByType: txByType.map((t) => ({
      type: t.type,
      count: t._count._all,
      points: t._sum.points ?? 0,
      amount: String(t._sum.amount ?? 0),
    })),
    recentTransactions: txRecent,
    withdrawals,
  };
}

/**
 * Is a withdrawal hold in force for this account? Set by the "Hold their
 * withdrawals" action on a case that is still OPEN or ACTIONED — resolving or
 * dismissing the case lifts it. Read by the admin withdrawal approve step; it
 * never moves money, it only stops an approval.
 */
export async function withdrawalHoldCase(userId: string): Promise<string | null> {
  const c = await prisma.abuseCase.findFirst({
    where: { userId, withdrawalsHeld: true, status: { in: ["OPEN", "ACTIONED"] } },
    select: { id: true },
  });
  return c?.id ?? null;
}
