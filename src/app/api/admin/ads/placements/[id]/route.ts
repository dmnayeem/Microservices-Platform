import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clearRateCardCache } from "@/lib/ad-rate-card";
import {
  checkAdFitsPlacement,
  isCanonicalPlacement,
  placementLabel,
} from "@/lib/ad-placements";
import { writeAudit } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (body.platform !== undefined) data.platform = String(body.platform);
  // Per-space rotation interval: null clears it (→ global default); a number is
  // clamped to 5–60 seconds.
  if (body.rotationSeconds === null) {
    data.rotationSeconds = null;
  } else if (body.rotationSeconds !== undefined) {
    const n = Number(body.rotationSeconds);
    data.rotationSeconds = Number.isFinite(n)
      ? Math.min(60, Math.max(10, Math.round(n)))
      : null;
  }
  // Per-space interstitial ad duration (seconds). null clears (→ default 5s).
  if (body.interstitialSeconds === null) {
    data.interstitialSeconds = null;
  } else if (body.interstitialSeconds !== undefined) {
    const n = Number(body.interstitialSeconds);
    data.interstitialSeconds = Number.isFinite(n)
      ? Math.min(60, Math.max(3, Math.round(n)))
      : null;
  }
  // ── Rate card ────────────────────────────────────────────────────────────
  // Per-space click price. null clears it, and a cleared space falls back to the
  // global `ads.cpcUsd` — which is what every space did before there was a rate
  // card at all, so clearing is always safe.
  if (body.cpcUsd === null || body.cpcUsd === "") {
    data.cpcUsd = null;
  } else if (body.cpcUsd !== undefined) {
    const v = Number(body.cpcUsd);
    // Rejected, not clamped: an admin who typed 0 meant something, and silently
    // turning it into $0.001 would hand out inventory at a price nobody chose.
    if (!Number.isFinite(v) || v <= 0 || v > 100) {
      return NextResponse.json(
        { error: "Click price must be between $0.001 and $100, or blank to use the global rate." },
        { status: 400 }
      );
    }
    data.cpcUsd = v;
  }

  // Flat monthly sponsorship price.
  if (body.monthlyUsd === null || body.monthlyUsd === "") {
    data.monthlyUsd = null;
  } else if (body.monthlyUsd !== undefined) {
    const v = Number(body.monthlyUsd);
    if (!Number.isFinite(v) || v < 0 || v > 1_000_000) {
      return NextResponse.json(
        { error: "Monthly price must be between $0 and $1,000,000, or blank." },
        { status: 400 }
      );
    }
    data.monthlyUsd = v;
  }
  if (typeof body.isRentable === "boolean") data.isRentable = body.isRentable;

  const placement = await prisma.adPlacement.update({ where: { id }, data });
  // The resolver memoises rates for 30s; an admin who just changed one should
  // see it take effect, not wonder whether it saved.
  clearRateCardCache();
  return NextResponse.json({ placement });
}

/**
 * POST — move every ad out of this space into a real one.
 *
 * The DB carried a placement called `QW` that is in no mount point and no
 * canonical list. It is inactive, so it never served — and two ads sat inside
 * it, ACTIVE and funded, structurally unable to run, with nothing on any screen
 * saying so. Deleting the space silently would have deleted an admin's ads.
 *
 * So the space is not deleted and the ads are not touched by the system: this
 * hands the admin the one operation that actually fixes it, reassigning them to
 * a space that exists. The target must be canonical for the obvious reason —
 * moving ads from one dead space to another is not a fix.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const targetId = String(body.targetPlacementId || "");
  if (!targetId) {
    return NextResponse.json(
      { error: "targetPlacementId is required" },
      { status: 400 }
    );
  }
  const [from, to] = await Promise.all([
    prisma.adPlacement.findUnique({ where: { id }, select: { id: true, name: true } }),
    prisma.adPlacement.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, isActive: true },
    }),
  ]);
  if (!from || !to) {
    return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  }
  if (from.id === to.id) {
    return NextResponse.json(
      { error: "Pick a different space to move these ads into" },
      { status: 400 }
    );
  }
  if (!isCanonicalPlacement(to.name)) {
    return NextResponse.json(
      { error: `"${to.name}" is not a mounted ad space — the ads would still never serve.` },
      { status: 400 }
    );
  }
  // Every OTHER write path (admin create, admin edit, advertiser create,
  // advertiser edit) refuses an ad whose size or type the target space cannot
  // render. This one moved ads with no such check, so "unstranding" an ad could
  // land it in a space where it is just as unserveable — the same bug with a
  // different placement name on it.
  //
  // So: move the ads that FIT, leave the ones that do not exactly where they
  // are, and name them. Nothing is deleted and nothing is silently mangled;
  // the admin is told which ads still need a home and why, and can pick a
  // different space for those.
  const candidates = (await prisma.ad.findMany({
    where: { placementId: from.id },
    select: { id: true, headline: true, size: true, width: true, height: true, type: true },
  })) as unknown as {
    id: string;
    headline: string | null;
    size: string | null;
    width: number | null;
    height: number | null;
    type: string;
  }[];

  const fits: string[] = [];
  const problems: { adId: string; title: string; reason: string }[] = [];
  for (const ad of candidates) {
    const bad = checkAdFitsPlacement({
      placementName: to.name,
      placementLabel: placementLabel(to.name),
      size: ad.size,
      width: ad.width,
      height: ad.height,
      type: ad.type,
    });
    if (bad.length === 0) fits.push(ad.id);
    else
      problems.push({
        adId: ad.id,
        title: ad.headline ?? ad.id,
        reason: bad.map((b) => b.message).join(" "),
      });
  }

  if (candidates.length > 0 && fits.length === 0) {
    return NextResponse.json(
      {
        error: `None of these ads can render in ${placementLabel(to.name)}. ${problems[0]?.reason ?? ""}`.trim(),
        moved: 0,
        skipped: problems.length,
        problems,
      },
      { status: 400 }
    );
  }

  const { count } = await prisma.ad.updateMany({
    where: { placementId: from.id, id: { in: fits } },
    data: { placementId: to.id },
  });
  await writeAudit({
    actorId: session.user.id,
    action: "ads.placement.reassign",
    summary: `Moved ${count} ad(s) from ${from.name} to ${to.name}${
      problems.length ? ` — ${problems.length} left behind (wrong size or type)` : ""
    }`,
    entity: "AdPlacement",
    entityId: from.id,
    meta: {
      from: from.name,
      to: to.name,
      moved: count,
      skipped: problems.length,
      skippedAdIds: problems.map((x) => x.adId),
    },
  });
  return NextResponse.json({
    success: true,
    moved: count,
    skipped: problems.length,
    problems,
    to: to.name,
    /** True when the space is now empty and can be retired. */
    emptyNow: problems.length === 0,
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const row = await prisma.adPlacement.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  }
  // A canonical space is mounted in the code — deleting its row does not remove
  // the <AdRenderer>, it just makes every render of that space miss, until
  // `ensureDefaultPlacements()` puts the row back with no rate card and no
  // bookings. Only a junk space (one outside the canonical list) can be retired.
  if (isCanonicalPlacement(row.name)) {
    return NextResponse.json(
      {
        error: `${placementLabel(row.name)} is a real ad space that pages render — it can be switched off, but not deleted.`,
      },
      { status: 400 }
    );
  }
  const count = await prisma.ad.count({ where: { placementId: id } });
  if (count > 0) {
    return NextResponse.json(
      {
        error: `Cannot retire — ${count} ad(s) are still in this space. Move them somewhere that renders first.`,
      },
      { status: 400 }
    );
  }
  await prisma.adPlacement.delete({ where: { id } });
  // Retiring a space also drops its bookings and serve stats (both cascade), so
  // it is a real deletion and belongs in the log with a name on it.
  await writeAudit({
    actorId: session.user.id,
    action: "ads.placement.delete",
    summary: `Retired the dead ad space "${row.name}"`,
    entity: "AdPlacement",
    entityId: id,
    meta: { name: row.name },
  });
  return NextResponse.json({ success: true, name: row.name });
}
