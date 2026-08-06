import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const campaigns = await prisma.adCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { ads: true } } },
  });
  return NextResponse.json({ campaigns });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (title.length < 2) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const parseDate = (v: unknown): Date | null => {
    if (!v) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  };
  const campaign = await prisma.adCampaign.create({
    data: {
      title,
      description: body.description ? String(body.description) : null,
      budget: Number(body.budget) || 0,
      status: ["ACTIVE", "PAUSED", "ENDED"].includes(body.status) ? body.status : "ACTIVE",
      startAt: parseDate(body.startAt),
      endAt: parseDate(body.endAt),
    },
  });
  return NextResponse.json({ campaign });
}
