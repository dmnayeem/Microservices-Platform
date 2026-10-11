import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { contestAdminGuard as engagementGuard } from "@/lib/contests-admin";
import { awardSpotlight, cancelSpotlight } from "@/lib/spotlight-server";
import { prisma } from "@/lib/prisma";

/**
 * POST `{ action: "close" | "cancel" }` — close now (top bid wins, even before
 * the end time) or cancel (the held bid is returned).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await engagementGuard("events.manage");
  if ("res" in g) return g.res;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const a = await prisma.spotlightAuction.findUnique({ where: { id }, select: { title: true } });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (body.action === "cancel") {
    const r = await cancelSpotlight(id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    await writeAudit({ actorId: g.userId, action: "SPOTLIGHT_CANCELLED", entity: "SpotlightAuction", entityId: id, summary: `Cancelled Spotlight "${a.title}"` });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "close") {
    const r = await awardSpotlight(id);
    if (r === "skipped") return NextResponse.json({ error: "Only an open spotlight can be closed." }, { status: 400 });
    await writeAudit({ actorId: g.userId, action: "SPOTLIGHT_CLOSED", entity: "SpotlightAuction", entityId: id, summary: `Closed Spotlight "${a.title}" — ${r}` });
    return NextResponse.json({ ok: true, result: r });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
