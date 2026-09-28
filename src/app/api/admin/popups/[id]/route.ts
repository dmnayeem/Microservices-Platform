import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { popupData, popupSchema } from "@/lib/popup-input";
import { POPUPS_TAG } from "@/lib/popups-server";

async function guard() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await can(session.user.id, "banners.manage"))) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId: session.user.id };
}

// PATCH /api/admin/popups/:id — full edit, or just { isActive } to switch it.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  let data;
  if (Object.keys(body).length === 1 && typeof body.isActive === "boolean") {
    data = { isActive: body.isActive };
  } else {
    const v = popupSchema.safeParse(body);
    if (!v.success) return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    data = popupData(body, v.data);
  }
  const popup = await prisma.sitePopup.update({ where: { id }, data }).catch(() => null);
  if (!popup) return NextResponse.json({ error: "Popup not found" }, { status: 404 });
  revalidateTag(POPUPS_TAG, "max");
  await writeAudit({
    actorId: g.userId,
    action: "POPUP_UPDATED",
    entity: "SitePopup",
    entityId: id,
    summary: "isActive" in data && Object.keys(data).length === 1
      ? `${popup.isActive ? "Turned on" : "Turned off"} popup "${popup.title}"`
      : `Edited popup "${popup.title}"`,
  });
  return NextResponse.json({ popup });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { id } = await params;
  const popup = await prisma.sitePopup.delete({ where: { id } }).catch(() => null);
  if (!popup) return NextResponse.json({ error: "Popup not found" }, { status: 404 });
  revalidateTag(POPUPS_TAG, "max");
  await writeAudit({
    actorId: g.userId,
    action: "POPUP_DELETED",
    entity: "SitePopup",
    entityId: id,
    summary: `Deleted popup "${popup.title}"`,
    meta: { snapshot: { title: popup.title, kind: popup.kind, views: popup.views, clicks: popup.clicks } },
  });
  return NextResponse.json({ ok: true });
}
