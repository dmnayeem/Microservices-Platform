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
  // An admin-created campaign has no advertiser, so it is the platform's OWN
  // inventory — house.
  //
  // `isHouse` existed, four places read it, and a one-time migration back-filled
  // it — but nothing in the application ever wrote it, so every campaign created
  // since has been `false`. Two things were broken as a result: the owner's own
  // campaigns had to carry a real budget or `servableCampaignWhere` would not
  // serve them (it exempts house campaigns from the budget floor), and the
  // "ad-free plans still see house ads" design delivered nothing, because
  // `houseOnly` filters on `isHouse: true` and the house pool was always empty.
  const isHouse =
    body.isHouse === undefined ? !body.advertiserId : Boolean(body.isHouse);

  const campaign = await prisma.adCampaign.create({
    data: {
      title,
      description: body.description ? String(body.description) : null,
      budget: Number(body.budget) || 0,
      status: ["ACTIVE", "PAUSED", "ENDED"].includes(body.status) ? body.status : "ACTIVE",
      startAt: parseDate(body.startAt),
      endAt: parseDate(body.endAt),
      isHouse,
    },
  });
  return NextResponse.json({ campaign });
}
