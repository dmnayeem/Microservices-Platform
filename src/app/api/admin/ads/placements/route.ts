import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureDefaultPlacements } from "@/lib/ad-placements-server";
import { getSetting } from "@/lib/system-settings";
import { getAdDensity } from "@/lib/ad-density";

export async function GET() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Make sure the canonical slots always exist.
  await ensureDefaultPlacements().catch(() => {});
  const [placements, ads] = await Promise.all([
    prisma.adPlacement.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { ads: true } } },
    }),
    prisma.ad.findMany({
      select: { placementId: true, status: true, impressions: true, clicks: true },
    }),
  ]);

  // Aggregate live stats per placement from the Ad table.
  const statsByPlacement = new Map<
    string,
    { impressions: number; clicks: number; activeAds: number; totalAds: number }
  >();
  for (const ad of ads) {
    const cur =
      statsByPlacement.get(ad.placementId) ?? {
        impressions: 0,
        clicks: 0,
        activeAds: 0,
        totalAds: 0,
      };
    cur.impressions += ad.impressions;
    cur.clicks += ad.clicks;
    cur.totalAds += 1;
    if (ad.status === "ACTIVE") cur.activeAds += 1;
    statsByPlacement.set(ad.placementId, cur);
  }

  const withStats = placements.map((p) => ({
    ...p,
    stats:
      statsByPlacement.get(p.id) ?? {
        impressions: 0,
        clicks: 0,
        activeAds: 0,
        totalAds: 0,
      },
  }));

  const rotationSeconds = Math.min(
    60,
    Math.max(5, Number(await getSetting<number>("ads.rotation_seconds", 12)) || 12)
  );
  const cpcUsd = Math.min(
    100,
    Math.max(0.001, Number(await getSetting<number>("ads.cpcUsd", 0.05)) || 0.05)
  );
  const adsenseClient = String((await getSetting<string>("ads.adsense_client", "")) || "");
  const gamNetworkCode = String((await getSetting<string>("ads.gam_network_code", "")) || "");
  const density = await getAdDensity();

  return NextResponse.json({
    placements: withStats,
    rotationSeconds,
    cpcUsd,
    adsenseClient,
    gamNetworkCode,
    density,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim().toUpperCase().replace(/\s+/g, "_");
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const placement = await prisma.adPlacement.upsert({
    where: { name },
    create: { name, platform: body.platform || "ALL", isActive: true },
    update: {},
  });
  return NextResponse.json({ placement });
}
