import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  const role = session?.user?.role as UserRole | undefined;
  if (!session?.user || !hasPermission(role, "ads.manage")) {
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
  const placement = await prisma.adPlacement.update({ where: { id }, data });
  return NextResponse.json({ placement });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  const role = session?.user?.role as UserRole | undefined;
  if (!session?.user || !hasPermission(role, "ads.manage")) {
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
