import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { financeGuard } from "@/lib/company-finance/api";
import { writeAudit } from "@/lib/audit";
import { saveSetting } from "@/lib/system-settings";
import {
  MAX_TEST_USERS,
  TEST_USERS_SETTING_KEY,
  getFinanceTestUserIds,
} from "@/lib/finance/test-users";

/**
 * Finance test users — the accounts admins test with, left out of every
 * finance figure (see src/lib/finance/test-users.ts).
 *
 * GET  ?q=…   search users (name / email / username / id), max 20, one query.
 * GET         the current test users, one query.
 * POST        { userId, action: "add" | "remove" }.
 *
 * Reading needs `finance.view`; changing the list needs `finance.settings`,
 * because it changes what every finance report says. Both come through
 * `financeGuard`, i.e. the effective permission set with the finance wall
 * applied — finance access is never granted any other way.
 */

const USER_SELECT = { id: true, name: true, email: true, username: true, role: true } as const;

export async function GET(request: NextRequest) {
  const g = await financeGuard("finance.view");
  if ("res" in g) return g.res;

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  const ids = await getFinanceTestUserIds();
  const testSet = new Set(ids);

  if (q.length >= 2) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { id: q },
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
        ],
      },
      select: USER_SELECT,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({
      users: users.map((u) => ({ ...u, isTest: testSet.has(u.id) })),
      count: ids.length,
      max: MAX_TEST_USERS,
    });
  }

  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: USER_SELECT })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return NextResponse.json({
    // In the order they were marked; an id whose account is gone still shows,
    // so it can be removed.
    testUsers: ids.map(
      (id) => byId.get(id) ?? { id, name: null, email: "(deleted user)", username: null, role: "USER" }
    ),
    count: ids.length,
    max: MAX_TEST_USERS,
    canManage: g.caller.can("finance.settings"),
  });
}

export async function POST(request: NextRequest) {
  const g = await financeGuard("finance.settings");
  if ("res" in g) return g.res;

  const body = (await request.json().catch(() => null)) as {
    userId?: unknown;
    action?: unknown;
  } | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const action = body?.action;
  if (!userId || (action !== "add" && action !== "remove")) {
    return NextResponse.json({ error: "Send a userId and action add or remove." }, { status: 400 });
  }

  const ids = await getFinanceTestUserIds();
  const has = ids.includes(userId);

  if (action === "add") {
    if (has) return NextResponse.json({ ok: true, count: ids.length });
    if (ids.length >= MAX_TEST_USERS) {
      return NextResponse.json(
        { error: `At most ${MAX_TEST_USERS} test users. Remove one first.` },
        { status: 400 }
      );
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
    const next = [...ids, userId];
    await saveSetting(TEST_USERS_SETTING_KEY, next, "finance");
    await writeAudit({
      actorId: g.caller.id,
      action: "finance.test_user.add",
      entity: "User",
      entityId: userId,
      targetUserId: userId,
      summary: `Marked ${user.email} as a finance test user (excluded from finance reports)`,
      meta: { count: next.length },
    });
    return NextResponse.json({ ok: true, count: next.length });
  }

  if (!has) return NextResponse.json({ ok: true, count: ids.length });
  const next = ids.filter((id) => id !== userId);
  await saveSetting(TEST_USERS_SETTING_KEY, next, "finance");
  await writeAudit({
    actorId: g.caller.id,
    action: "finance.test_user.remove",
    entity: "User",
    entityId: userId,
    targetUserId: userId,
    summary: "Removed from finance test users (counted in finance reports again)",
    meta: { count: next.length },
  });
  return NextResponse.json({ ok: true, count: next.length });
}
