import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { contestAdminGuard as engagementGuard } from "@/lib/contests-admin";
import { IDEA_STATUSES, type IdeaStatus } from "@/lib/feedback";
import { notifyIdeaShipped } from "@/lib/feedback-server";

/** GET: every idea (most votes first) with its author. */
export async function GET() {
  const g = await engagementGuard("events.view");
  if ("res" in g) return g.res;
  const ideas = await prisma.featureIdea.findMany({ orderBy: [{ votes: "desc" }, { createdAt: "desc" }], take: 500 });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(ideas.map((i) => i.userId))] } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return NextResponse.json({ ideas: ideas.map((i) => ({ ...i, user: byId.get(i.userId) ?? null })) });
}

/** PATCH `{ id, status?, adminNote? }` — moving to SHIPPED tells the author and every voter. */
export async function PATCH(request: NextRequest) {
  const g = await engagementGuard("events.manage");
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; status?: unknown; adminNote?: unknown };
  const id = String(body.id ?? "");
  const existing = await prisma.featureIdea.findUnique({ where: { id }, select: { status: true, title: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const status = typeof body.status === "string" && (IDEA_STATUSES as readonly string[]).includes(body.status) ? (body.status as IdeaStatus) : undefined;
  const adminNote = body.adminNote !== undefined ? String(body.adminNote ?? "").trim().slice(0, 500) || null : undefined;
  const shipping = status === "SHIPPED" && existing.status !== "SHIPPED";
  await prisma.featureIdea.update({
    where: { id },
    data: { ...(status ? { status } : {}), ...(adminNote !== undefined ? { adminNote } : {}), ...(shipping ? { shippedAt: new Date() } : {}) },
  });
  let told = 0;
  if (shipping) told = await notifyIdeaShipped(id);
  if (status) {
    await writeAudit({ actorId: g.userId, action: `FEATURE_IDEA_${status}`, entity: "FeatureIdea", entityId: id, summary: `Idea "${existing.title}" → ${status}${told ? ` (${told} told)` : ""}` });
  }
  return NextResponse.json({ ok: true, told });
}
