import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

/**
 * Unified per-user activity timeline for the admin User Activity view. Merges a
 * bounded slice of every meaningful per-user source (money/points ledger, tasks,
 * withdrawals, deposits, KYC, referrals, and admin actions taken ON this user)
 * into one chronological, normalized list. Each source is capped so a single
 * user page never fans out unbounded.
 */

export type ActivityKind =
  | "transaction"
  | "task"
  | "withdrawal"
  | "deposit"
  | "kyc"
  | "referral"
  | "admin";

export interface ActivityEvent {
  id: string;
  at: string; // ISO
  kind: ActivityKind;
  title: string;
  detail?: string;
  /** Points delta (+/-) when relevant. */
  points?: number;
  /** Cash delta (+/-) when relevant. */
  amount?: number;
  /** Status badge (task/withdrawal/deposit/kyc). */
  status?: string;
  /** For admin-action rows: the acting admin's display name. */
  actorName?: string;
}

const PER_SOURCE = 30;

export async function getUserActivity(userId: string): Promise<ActivityEvent[]> {
  const [txns, subs, withdrawals, deposits, kyc, referrals, adminActions] =
    await Promise.all([
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
        select: {
          id: true,
          type: true,
          status: true,
          points: true,
          amount: true,
          description: true,
          createdAt: true,
        },
      }),
      prisma.taskSubmission.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
        select: {
          id: true,
          status: true,
          pointsEarned: true,
          createdAt: true,
          submittedAt: true,
          reviewedAt: true,
          task: { select: { title: true, type: true } },
        },
      }) as unknown as Promise<
        {
          id: string;
          status: string;
          pointsEarned: number | null;
          createdAt: Date;
          submittedAt: Date | null;
          reviewedAt: Date | null;
          task: { title: string; type: string } | null;
        }[]
      >,
      prisma.withdrawal.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
        select: {
          id: true,
          status: true,
          amount: true,
          netAmount: true,
          method: true,
          createdAt: true,
        },
      }),
      prisma.deposit.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
        select: { id: true, status: true, amount: true, method: true, createdAt: true },
      }).catch(() => [] as { id: string; status: string; amount: unknown; method: string; createdAt: Date }[]),
      prisma.kYCDocument.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, status: true, documentType: true, createdAt: true },
      }).catch(() => [] as { id: string; status: string; documentType: string; createdAt: Date }[]),
      prisma.user.findMany({
        where: { referredById: userId },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
        select: { id: true, name: true, email: true, createdAt: true },
      }),
      prisma.auditLog.findMany({
        // `targetUserId` is the right column, but rows written before it was
        // filled in only carry the user in `entityId`. Matching both means the
        // history already on disk shows up here instead of appearing to start
        // on the day the writers were fixed.
        where: {
          OR: [
            { targetUserId: userId },
            { targetUserId: null, entity: "User", entityId: userId },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
        select: {
          id: true,
          action: true,
          summary: true,
          userId: true,
          createdAt: true,
        },
      }),
    ]);

  // Resolve acting-admin names for the admin-action rows.
  const actorIds = [...new Set(adminActions.map((a) => a.userId).filter(Boolean))] as string[];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a.name || a.email || "Admin"]));

  const events: ActivityEvent[] = [];

  for (const t of txns) {
    const amt = toNum(t.amount as never);
    events.push({
      id: `tx_${t.id}`,
      at: t.createdAt.toISOString(),
      kind: "transaction",
      title: prettyType(t.type),
      detail: t.description ?? undefined,
      points: t.points || undefined,
      amount: amt || undefined,
      status: t.status,
    });
  }
  for (const s of subs) {
    events.push({
      id: `sub_${s.id}`,
      at: (s.reviewedAt ?? s.submittedAt ?? s.createdAt).toISOString(),
      kind: "task",
      title: s.task?.title ? `Task: ${s.task.title}` : "Task submission",
      detail: s.task?.type ? `${s.task.type} · ${prettyStatus(s.status)}` : prettyStatus(s.status),
      points: s.pointsEarned || undefined,
      status: s.status,
    });
  }
  for (const w of withdrawals) {
    events.push({
      id: `wd_${w.id}`,
      at: w.createdAt.toISOString(),
      kind: "withdrawal",
      title: `Withdrawal · ${w.method}`,
      detail: prettyStatus(w.status),
      amount: -toNum(w.netAmount as never) || undefined,
      status: w.status,
    });
  }
  for (const d of deposits) {
    events.push({
      id: `dp_${d.id}`,
      at: d.createdAt.toISOString(),
      kind: "deposit",
      title: `Deposit · ${d.method}`,
      detail: prettyStatus(d.status),
      amount: toNum(d.amount as never) || undefined,
      status: d.status,
    });
  }
  for (const k of kyc) {
    events.push({
      id: `kyc_${k.id}`,
      at: k.createdAt.toISOString(),
      kind: "kyc",
      title: `KYC · ${k.documentType}`,
      detail: prettyStatus(k.status),
      status: k.status,
    });
  }
  for (const r of referrals) {
    events.push({
      id: `ref_${r.id}`,
      at: r.createdAt.toISOString(),
      kind: "referral",
      title: "Referred a new user",
      detail: r.name || r.email || undefined,
    });
  }
  for (const a of adminActions) {
    events.push({
      id: `adm_${a.id}`,
      at: a.createdAt.toISOString(),
      kind: "admin",
      title: a.summary || prettyStatus(a.action),
      detail: "Admin action",
      actorName: a.userId ? actorMap.get(a.userId) ?? "Admin" : "System",
    });
  }

  events.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
  return events.slice(0, 120);
}

function prettyType(t: string): string {
  return t
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function prettyStatus(s: string): string {
  return prettyType(s);
}
