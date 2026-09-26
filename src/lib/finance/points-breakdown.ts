import "server-only";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { isStaffRole } from "@/lib/staff";
import { isPointsDeducted, isPointsEarned, magnitudePoints } from "@/lib/finance/signing";
import { pointSourceOf, submissionIdOf, type PointSource } from "@/lib/finance/points-source";

/**
 * Where the points in a period came from, and who got them.
 *
 * Built for the question the Overview card could not answer: "Points earned
 * today: 6,692 — from what?" On the day this was written, 5,000 of them were a
 * single leaderboard prize, and actual tasks were ~130. The card was right; the
 * page just gave no way to see inside it.
 *
 * Same row rule as the card (`isPointsEarned`), so the total here always equals
 * the card for the same period.
 */

export interface PointsBySource {
  source: PointSource;
  points: number;
  rows: number;
  users: number;
}

export interface PointsByUser {
  userId: string;
  name: string | null;
  email: string;
  staff: boolean;
  points: number;
  rows: number;
  /** Their points split by source, largest first. */
  sources: Array<{ source: PointSource; points: number }>;
}

export interface AdminGrant {
  id: string;
  createdAt: Date;
  points: number;
  userId: string;
  userName: string | null;
  userEmail: string;
  description: string | null;
  /** The admin who granted it — null for grants written before this was recorded. */
  grantedBy: string | null;
}

export interface PointsBreakdown {
  from: Date;
  to: Date;
  pointsPerUsd: number;
  totalPoints: number;
  totalRows: number;
  staffPoints: number;
  deductedPoints: number;
  bySource: PointsBySource[];
  taskByType: Array<{ type: string; points: number; rows: number }>;
  byUser: PointsByUser[];
  adminGrants: AdminGrant[];
}

export async function getPointsBreakdown(from: Date, to: Date): Promise<PointsBreakdown> {
  const [pointsPerUsd, raw] = await Promise.all([
    getPointsPerUsd(),
    prisma.transaction.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        reference: true,
        amount: true,
        points: true,
        description: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ]);

  type R = (typeof raw)[number] & { src: PointSource; pts: number };
  const earned: R[] = [];
  let deductedPoints = 0;
  for (const row of raw) {
    const r = { type: row.type, status: row.status, reference: row.reference, amount: Number(row.amount ?? 0), points: row.points ?? 0 };
    if (isPointsDeducted(r)) {
      deductedPoints += magnitudePoints(r);
      continue;
    }
    if (!isPointsEarned(r)) continue;
    earned.push({ ...row, src: pointSourceOf(row), pts: magnitudePoints(r) });
  }

  const userIds = [...new Set(earned.map((e) => e.userId))];
  const grantAdminIds = earned
    .filter((e) => e.src === "admin_grant")
    .map((e) => (e.metadata as { adminId?: string } | null)?.adminId)
    .filter((v): v is string => !!v);
  const subIds = [...new Set(earned.filter((e) => e.src === "task").map((e) => submissionIdOf(e.reference)).filter((v): v is string => !!v))];

  const [users, subs] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...new Set([...userIds, ...grantAdminIds])] } },
      select: { id: true, name: true, email: true, role: true },
    }),
    subIds.length
      ? prisma.taskSubmission.findMany({ where: { id: { in: subIds } }, select: { id: true, task: { select: { type: true } } } })
      : Promise.resolve([]),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const typeBySub = new Map(
    (subs as unknown as Array<{ id: string; task: { type: string } | null }>).map((s) => [s.id, s.task?.type ?? "UNKNOWN"])
  );

  const src = new Map<PointSource, { points: number; rows: number; users: Set<string> }>();
  const tasks = new Map<string, { points: number; rows: number }>();
  const per = new Map<string, { points: number; rows: number; by: Map<PointSource, number> }>();
  let totalPoints = 0;
  let staffPoints = 0;

  for (const e of earned) {
    totalPoints += e.pts;
    if (isStaffRole(userById.get(e.userId)?.role)) staffPoints += e.pts;

    const s = src.get(e.src) ?? { points: 0, rows: 0, users: new Set<string>() };
    s.points += e.pts;
    s.rows += 1;
    s.users.add(e.userId);
    src.set(e.src, s);

    if (e.src === "task") {
      const id = submissionIdOf(e.reference);
      const t = (id && typeBySub.get(id)) || "UNKNOWN";
      const tt = tasks.get(t) ?? { points: 0, rows: 0 };
      tt.points += e.pts;
      tt.rows += 1;
      tasks.set(t, tt);
    }

    const u = per.get(e.userId) ?? { points: 0, rows: 0, by: new Map<PointSource, number>() };
    u.points += e.pts;
    u.rows += 1;
    u.by.set(e.src, (u.by.get(e.src) ?? 0) + e.pts);
    per.set(e.userId, u);
  }

  const byUser: PointsByUser[] = [...per.entries()]
    .map(([userId, v]) => {
      const u = userById.get(userId);
      return {
        userId,
        name: u?.name ?? null,
        email: u?.email ?? "(deleted user)",
        staff: isStaffRole(u?.role),
        points: v.points,
        rows: v.rows,
        sources: [...v.by.entries()].map(([source, points]) => ({ source, points })).sort((a, b) => b.points - a.points),
      };
    })
    .sort((a, b) => b.points - a.points);

  const adminGrants: AdminGrant[] = earned
    .filter((e) => e.src === "admin_grant")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((e) => {
      const u = userById.get(e.userId);
      const adminId = (e.metadata as { adminId?: string } | null)?.adminId;
      const admin = adminId ? userById.get(adminId) : null;
      return {
        id: e.id,
        createdAt: e.createdAt,
        points: e.pts,
        userId: e.userId,
        userName: u?.name ?? null,
        userEmail: u?.email ?? "(deleted user)",
        description: e.description,
        grantedBy: admin ? admin.name ?? admin.email : null,
      };
    });

  return {
    from,
    to,
    pointsPerUsd,
    totalPoints,
    totalRows: earned.length,
    staffPoints,
    deductedPoints,
    bySource: [...src.entries()]
      .map(([source, v]) => ({ source, points: v.points, rows: v.rows, users: v.users.size }))
      .sort((a, b) => b.points - a.points),
    taskByType: [...tasks.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.points - a.points),
    byUser,
    adminGrants,
  };
}
