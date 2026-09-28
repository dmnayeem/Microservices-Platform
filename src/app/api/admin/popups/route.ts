import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { popupData, popupSchema } from "@/lib/popup-input";
import { POPUPS_TAG } from "@/lib/popups-server";

// Popups share the banners' permissions: both are on-site marketing.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "banners.view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const popups = await prisma.sitePopup.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
  return NextResponse.json({ popups });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "banners.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const v = popupSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const popup = await prisma.sitePopup.create({
    data: { ...popupData(body, v.data), createdById: session.user.id },
  });
  revalidateTag(POPUPS_TAG, "max");
  await writeAudit({
    actorId: session.user.id,
    action: "POPUP_CREATED",
    entity: "SitePopup",
    entityId: popup.id,
    summary: `Created popup "${popup.title}"`,
  });
  return NextResponse.json({ popup }, { status: 201 });
}
