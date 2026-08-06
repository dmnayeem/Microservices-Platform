import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { offerSchema } from "../route";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Partial update — every field optional.
const patchSchema = offerSchema.partial();

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.categoryId !== undefined) data.categoryId = d.categoryId;
  if (d.title !== undefined) data.title = d.title.trim();
  if (d.description !== undefined) data.description = d.description?.trim() || null;
  if (d.instructions !== undefined)
    data.instructions = d.instructions.map((s) => s.trim()).filter(Boolean).slice(0, 15);
  if (d.imageUrl !== undefined) data.imageUrl = d.imageUrl?.trim() || null;
  if (d.points !== undefined) data.points = d.points;
  if (d.payoutUsd !== undefined) data.payoutUsd = d.payoutUsd ?? null;
  if (d.countries !== undefined)
    data.countries = d.countries.map((c) => c.trim().toUpperCase()).filter((c) => c && c !== "ALL");
  if (d.order !== undefined) data.order = d.order;
  if (d.trackingUrlTemplate !== undefined) data.trackingUrlTemplate = d.trackingUrlTemplate?.trim() || null;
  if (d.source !== undefined) data.source = d.source;
  if (d.providerId !== undefined) data.providerId = d.providerId?.trim() || null;
  if (d.externalOfferId !== undefined) data.externalOfferId = d.externalOfferId?.trim() || null;
  if (d.completionMode !== undefined) data.completionMode = d.completionMode;
  if (d.proofScreenshot !== undefined) data.proofScreenshot = d.proofScreenshot;
  if (d.dailyLimit !== undefined) data.dailyLimit = d.dailyLimit ?? null;
  if (d.oneTimePerUser !== undefined) data.oneTimePerUser = d.oneTimePerUser;
  if (d.holdHours !== undefined) data.holdHours = d.holdHours;
  if (d.featured !== undefined) data.featured = d.featured;
  if (d.isActive !== undefined) data.isActive = d.isActive;

  try {
    const offer = await prisma.offerwallOffer.update({ where: { id }, data });
    return NextResponse.json({ offer });
  } catch {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.offerwallOffer.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
