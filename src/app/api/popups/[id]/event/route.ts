import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/popups/:id/event { type: "view" | "click" } — the counters shown
// on /admin/popups. Public (visitors see popups too) and best-effort: a
// throttled or failed count never affects the page.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(request, "popup-event", 60, 60_000);
  if (limited) return limited;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const type = (body as { type?: string }).type;
  if (type !== "view" && type !== "click") {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }
  await prisma.sitePopup
    .update({
      where: { id },
      data: type === "view" ? { views: { increment: 1 } } : { clicks: { increment: 1 } },
      select: { id: true },
    })
    .catch(() => null);
  return NextResponse.json({ ok: true });
}
