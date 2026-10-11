import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { contestAdminGuard } from "@/lib/contests-admin";
import { contestStandings } from "@/lib/contests-server";

/** GET: every entry with its entrant and live score. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await contestAdminGuard("events.view");
  if ("res" in g) return g.res;
  const { id } = await params;
  const [entries, standings] = await Promise.all([
    prisma.contestEntry.findMany({ where: { contestId: id }, orderBy: { createdAt: "asc" }, take: 1000 }),
    contestStandings(id),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(entries.map((e) => e.userId))] } },
    select: { id: true, name: true, email: true, level: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const live = new Map(standings.map((s, i) => [s.entryId, { score: s.score, position: i + 1 }]));
  return NextResponse.json({
    entries: entries.map((e) => ({ ...e, user: byId.get(e.userId) ?? null, live: live.get(e.id) ?? null })),
  });
}

/** PATCH `{ entryId, status?, adminScore?, rejectReason? }` */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contestAdminGuard("events.manage");
  if ("res" in g) return g.res;
  const { id } = await params;
  const contest = await prisma.contest.findUnique({ where: { id }, select: { status: true, title: true } });
  if (!contest) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (contest.status === "FINISHED") {
    return NextResponse.json({ error: "The contest is finalized." }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const entryId = String(body.entryId ?? "");
  const data: { status?: string; adminScore?: number | null; rejectReason?: string | null } = {};
  if (body.status === "APPROVED" || body.status === "REJECTED" || body.status === "PENDING") data.status = body.status;
  if (body.adminScore !== undefined) {
    const n = body.adminScore === null || body.adminScore === "" ? null : Math.round(Number(body.adminScore));
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 10)) {
      return NextResponse.json({ error: "The score is 0–10." }, { status: 400 });
    }
    data.adminScore = n;
  }
  if (body.rejectReason !== undefined) {
    data.rejectReason = body.rejectReason ? String(body.rejectReason).slice(0, 300) : null;
  }
  const r = await prisma.contestEntry.updateMany({ where: { id: entryId, contestId: id }, data });
  if (r.count === 0) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  if (data.status) {
    await writeAudit({
      actorId: g.userId,
      action: `CONTEST_ENTRY_${data.status}`,
      entity: "ContestEntry",
      entityId: entryId,
      summary: `Contest "${contest.title}": entry ${data.status.toLowerCase()}`,
    });
  }
  return NextResponse.json({ ok: true });
}
