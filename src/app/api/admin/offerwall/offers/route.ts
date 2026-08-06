import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { z } from "zod";

export const offerSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  instructions: z.array(z.string().max(300)).max(15).optional(),
  imageUrl: z.string().max(600).optional().nullable(),
  points: z.number().int().min(0).max(10_000_000),
  payoutUsd: z.number().min(0).max(100000).optional().nullable(),
  countries: z.array(z.string().max(3)).max(250).optional(),
  order: z.number().int().min(0).max(99999).optional(),
  trackingUrlTemplate: z.string().max(1000).optional().nullable(),
  source: z.enum(["MANUAL", "PROVIDER"]).optional(),
  providerId: z.string().optional().nullable(),
  externalOfferId: z.string().max(200).optional().nullable(),
  completionMode: z.enum(["PROOF", "POSTBACK", "MANUAL"]).optional(),
  proofScreenshot: z.boolean().optional(),
  dailyLimit: z.number().int().min(1).max(1000).optional().nullable(),
  oneTimePerUser: z.boolean().optional(),
  holdHours: z.number().int().min(0).max(2160).optional(),
  featured: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const clean = (d: z.infer<typeof offerSchema>) => ({
  categoryId: d.categoryId,
  title: d.title.trim(),
  description: d.description?.trim() || null,
  instructions: (d.instructions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 15),
  imageUrl: d.imageUrl?.trim() || null,
  points: d.points,
  payoutUsd: d.payoutUsd ?? null,
  countries: (d.countries ?? []).map((c) => c.trim().toUpperCase()).filter((c) => c && c !== "ALL"),
  order: d.order ?? 0,
  trackingUrlTemplate: d.trackingUrlTemplate?.trim() || null,
  source: d.source ?? "MANUAL",
  providerId: d.providerId?.trim() || null,
  externalOfferId: d.externalOfferId?.trim() || null,
  completionMode: d.completionMode ?? "PROOF",
  proofScreenshot: d.proofScreenshot ?? true,
  dailyLimit: d.dailyLimit ?? null,
  oneTimePerUser: d.oneTimePerUser ?? true,
  holdHours: d.holdHours ?? 0,
  featured: d.featured ?? false,
  isActive: d.isActive ?? true,
});

// GET /api/admin/offerwall/offers?categoryId= — list offers (optionally by category).
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.view")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const categoryId = new URL(request.url).searchParams.get("categoryId") || undefined;
  const offers = await prisma.offerwallOffer.findMany({
    where: categoryId ? { categoryId } : undefined,
    orderBy: [{ categoryId: "asc" }, { order: "asc" }, { createdAt: "desc" }],
    include: { category: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ offers });
}

// POST /api/admin/offerwall/offers — create.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = offerSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const cat = await prisma.offerwallCategory.findUnique({ where: { id: parsed.data.categoryId }, select: { id: true } });
  if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 400 });

  const offer = await prisma.offerwallOffer.create({ data: clean(parsed.data) });
  return NextResponse.json({ offer });
}
