import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { financeGuard, auditFinance } from "@/lib/company-finance/api";
import {
  createFinanceModerator,
  grantableBy,
  listFinanceTeam,
  setFinanceGrants,
  setModeratorRole,
  setModeratorStatus,
} from "@/lib/company-finance/team";
import { PERMISSION_META, type Permission, type UserRole } from "@/lib/rbac";

export const runtime = "nodejs";

/** The finance team, and — for a super admin — any staff member to grant access to. */
export async function GET(request: NextRequest) {
  const g = await financeGuard("finance.staff");
  if ("res" in g) return g.res;
  const actor = { id: g.caller.id, role: g.caller.role };
  const team = await listFinanceTeam();

  // Only a super admin can grant finance to people OUTSIDE the finance team,
  // so only a super admin gets the staff search.
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const candidates =
    actor.role === "SUPER_ADMIN" && q
      ? await prisma.user.findMany({
          where: {
            role: { notIn: ["USER", "SUPER_ADMIN", "FINANCE_ADMIN"] },
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 10,
          select: { id: true, name: true, email: true, role: true, financeGrants: true },
        })
      : [];

  const label = (p: string) => PERMISSION_META[p as Permission]?.label ?? p;
  return NextResponse.json({
    team: team.map((m) => ({
      ...m,
      grantable: grantableBy(actor, m.role as UserRole).map((p) => ({ key: p, label: label(p) })),
    })),
    candidates: candidates.map((c) => ({
      ...c,
      grantable: grantableBy(actor, c.role as UserRole).map((p) => ({ key: p, label: label(p) })),
    })),
    newModeratorGrantable: grantableBy(actor, "FINANCE_MODERATOR").map((p) => ({ key: p, label: label(p) })),
    actorRole: actor.role,
  });
}

/**
 * `action`:
 *  - create   { name, email, password, grants[] }
 *  - grants   { userId, grants[] }
 *  - promote  { userId }      a plain user → finance moderator
 *  - demote   { userId }      finance moderator → plain user (grants cleared)
 *  - suspend / activate { userId }
 */
export async function POST(request: NextRequest) {
  const g = await financeGuard("finance.staff");
  if ("res" in g) return g.res;
  const actor = { id: g.caller.id, role: g.caller.role };
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    userId?: string;
    name?: string;
    email?: string;
    password?: string;
    grants?: string[];
  };

  const target = body.userId
    ? await prisma.user.findUnique({ where: { id: body.userId }, select: { name: true, email: true } })
    : null;
  const who = target?.name ?? target?.email ?? "account";

  switch (body.action) {
    case "create": {
      const res = await createFinanceModerator(actor, {
        name: body.name ?? "",
        email: body.email ?? "",
        password: body.password ?? "",
        grants: body.grants ?? [],
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      await auditFinance(g.caller, "MODERATOR_CREATED", "User", res.data.id,
        `Created finance moderator ${body.name} <${body.email}>`, { grants: body.grants ?? [] });
      return NextResponse.json({ ok: true, id: res.data.id }, { status: 201 });
    }
    case "grants": {
      if (!body.userId) return NextResponse.json({ error: "Pick a person" }, { status: 400 });
      const res = await setFinanceGrants(actor, body.userId, body.grants ?? []);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      await auditFinance(g.caller, "ACCESS_GRANTED", "User", body.userId,
        res.data.grants.length ? `Set ${who}'s finance access: ${res.data.grants.join(", ")}` : `Removed all of ${who}'s finance access`,
        { grants: res.data.grants });
      return NextResponse.json({ ok: true, grants: res.data.grants });
    }
    case "promote":
    case "demote": {
      if (!body.userId) return NextResponse.json({ error: "Pick a person" }, { status: 400 });
      const res = await setModeratorRole(actor, body.userId, body.action === "promote");
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      await auditFinance(g.caller, body.action === "promote" ? "MODERATOR_PROMOTED" : "MODERATOR_REMOVED", "User",
        body.userId, body.action === "promote" ? `Made ${who} a finance moderator` : `Removed ${who} from the finance team`);
      return NextResponse.json({ ok: true, role: res.data.role });
    }
    case "suspend":
    case "activate": {
      if (!body.userId) return NextResponse.json({ error: "Pick a person" }, { status: 400 });
      const res = await setModeratorStatus(actor, body.userId, body.action === "activate");
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      await auditFinance(g.caller, body.action === "activate" ? "MODERATOR_ACTIVATED" : "MODERATOR_SUSPENDED", "User",
        body.userId, `${body.action === "activate" ? "Reactivated" : "Suspended"} ${who}`);
      return NextResponse.json({ ok: true, status: res.data.status });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
