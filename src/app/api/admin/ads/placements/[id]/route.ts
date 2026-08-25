import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clearRateCardCache } from "@/lib/ad-rate-card";

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
      ? Math.min(60, Math.max(5, Math.round(n)))
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

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const count = await prisma.ad.count({ where: { placementId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${count} ad(s) use this placement` },
      { status: 400 }
    );
  }
  await prisma.adPlacement.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
