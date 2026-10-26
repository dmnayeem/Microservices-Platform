import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { getSetting, saveSetting } from "@/lib/system-settings";
import { isStaffRole, STAFF_WHERE } from "@/lib/staff";
import { bad, userNames, workGuard } from "@/lib/work/server";
import { OPTION_KINDS } from "@/lib/work/model";

/** Team Work settings — work.settings only. Nothing is deleted: lists and teams are deactivated. */
async function guard() {
  const g = await workGuard();
  if ("error" in g) return g;
  if (!g.actor.perms.has("work.settings")) return { error: bad("You can't change Team Work settings.", 403) };
  return g;
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  const [options, teamRows, cooldown] = await Promise.all([
    prisma.workOption.findMany({ orderBy: [{ kind: "asc" }, { sort: "asc" }, { label: "asc" }] }),
    prisma.workTeam.findMany({ orderBy: { name: "asc" }, include: { members: { orderBy: { createdAt: "asc" } } } }),
    getSetting<number>("work.reminder_cooldown_minutes", 60),
  ]);
  // The include shape is lost in the Promise.all tuple's inference.
  const teams = teamRows as unknown as Array<{
    id: string;
    name: string;
    description: string | null;
    departmentId: string | null;
    isActive: boolean;
    members: Array<{ id: string; userId: string; isLead: boolean; positionId: string | null }>;
  }>;
  const names = await userNames(teams.flatMap((t) => t.members.map((m) => m.userId)));
  const staff = await prisma.user.findMany({
    where: { ...STAFF_WHERE, status: { notIn: ["BANNED", "SUSPENDED"] } },
    orderBy: { name: "asc" },
    take: 1000,
    select: { id: true, name: true, username: true, email: true, role: true },
  });
  return NextResponse.json({
    staff: staff.map((u) => ({ id: u.id, name: u.name || u.username || u.email, role: u.role })),
    options,
    teams: teams.map((t) => ({ ...t, members: t.members.map((m) => ({ ...m, user: names.get(m.userId) ?? null })) })),
    reminderCooldownMinutes: Number(cooldown) || 0,
  });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("option_add"), kind: z.enum(OPTION_KINDS), label: z.string().trim().min(1).max(80) }),
  z.object({
    action: z.literal("option_update"),
    id: z.string().min(1).max(64),
    label: z.string().trim().min(1).max(80).optional(),
    isActive: z.boolean().optional(),
    sort: z.number().int().min(0).max(10_000).optional(),
  }),
  z.object({
    action: z.literal("team_save"),
    id: z.string().min(1).max(64).optional(),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).nullish(),
    departmentId: z.string().min(1).max(64).nullish(),
    isActive: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("member_set"),
    teamId: z.string().min(1).max(64),
    userId: z.string().min(1).max(64),
    isLead: z.boolean().default(false),
    positionId: z.string().min(1).max(64).nullish(),
  }),
  z.object({ action: z.literal("member_remove"), teamId: z.string().min(1).max(64), userId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("cooldown"), minutes: z.number().int().min(0).max(10_080) }),
]);

export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid change");
  const b = parsed.data;
  let summary = "";

  try {
    if (b.action === "option_add") {
      await prisma.workOption.create({ data: { kind: b.kind, label: b.label } });
      summary = `Added ${b.kind.toLowerCase()} "${b.label}"`;
    } else if (b.action === "option_update") {
      const o = await prisma.workOption.update({
        where: { id: b.id },
        data: { ...(b.label ? { label: b.label } : {}), ...(b.isActive !== undefined ? { isActive: b.isActive } : {}), ...(b.sort !== undefined ? { sort: b.sort } : {}) },
      });
      summary = `Updated ${o.kind.toLowerCase()} "${o.label}"${b.isActive === false ? " (deactivated)" : ""}`;
    } else if (b.action === "team_save") {
      const data = { name: b.name, description: b.description || null, departmentId: b.departmentId || null, ...(b.isActive !== undefined ? { isActive: b.isActive } : {}) };
      if (b.id) await prisma.workTeam.update({ where: { id: b.id }, data });
      else await prisma.workTeam.create({ data });
      summary = `${b.id ? "Updated" : "Created"} team "${b.name}"`;
    } else if (b.action === "member_set") {
      const u = await prisma.user.findUnique({ where: { id: b.userId }, select: { role: true, name: true, email: true } });
      if (!u || !isStaffRole(u.role)) return bad("Only staff accounts can be in a team.");
      await prisma.workTeamMember.upsert({
        where: { teamId_userId: { teamId: b.teamId, userId: b.userId } },
        create: { teamId: b.teamId, userId: b.userId, isLead: b.isLead, positionId: b.positionId || null },
        update: { isLead: b.isLead, positionId: b.positionId || null },
      });
      summary = `Set ${u.name || u.email} in a team${b.isLead ? " as Team Lead" : ""}`;
    } else if (b.action === "member_remove") {
      await prisma.workTeamMember.deleteMany({ where: { teamId: b.teamId, userId: b.userId } });
      summary = "Removed a member from a team";
    } else {
      await saveSetting("work.reminder_cooldown_minutes", b.minutes, "work");
      summary = `Reminder cooldown set to ${b.minutes} min`;
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return bad("That name already exists.", 409);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return bad("Not found.", 404);
    throw e;
  }
  await writeAudit({ actorId: a.userId, action: "WORK_SETTINGS_UPDATED", entity: "WorkSettings", summary });
  return NextResponse.json({ ok: true });
}
