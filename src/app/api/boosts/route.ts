import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { withIdempotency } from "@/lib/idempotency";
import { userCanFeature } from "@/lib/packages";
import { adTargetingSchema } from "@/lib/ad-targeting-schema";
import { normalizeTargeting, type AdTargeting } from "@/lib/ad-targeting";
import { createBoost } from "@/lib/boost/core";
import { BOOST_MEMBER_SELECT, shapeMemberBoost, type MemberBoostRow } from "@/lib/boost-view";

// GET /api/boosts — the member's own boosts, newest first (optionally one post's).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const postId = req.nextUrl.searchParams.get("postId");
  const where: Prisma.BoostCampaignWhereInput = { userId: session.user.id };
  if (postId) where.postId = postId;
  // The cast: with `orderBy` present, this client's findMany types fall back to
  // the bare model and drop the nested `post` select (it IS returned at runtime).
  const rows = (await prisma.boostCampaign.findMany({
    where,
    select: BOOST_MEMBER_SELECT,
    orderBy: { createdAt: "desc" },
    take: 100,
  })) as unknown as MemberBoostRow[];
  return NextResponse.json({ boosts: rows.map(shapeMemberBoost) });
}

const strList = z.array(z.string().trim().min(1)).optional();
// The shared schema has no device fields, and zod's strip mode would silently
// drop the device rules the audience builder collects — so they are added here.
const targetingSchema = adTargetingSchema
  .unwrap()
  .extend({ deviceTypes: strList, deviceOses: strList, deviceBrands: strList })
  .nullish();

const bodySchema = z.object({
  postId: z.string().min(1),
  budgetPoints: z.number().int().positive(),
  durationDays: z.number().int().positive(),
  payFrom: z.enum(["AD_POINTS", "AD_FUND"]),
  targeting: targetingSchema,
});

// POST /api/boosts — create a boost. The budget is held now; createBoost owns
// every money and ownership rule.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the form and try again." },
      { status: 400 }
    );
  }

  return withIdempotency(req, userId, async () => {
    // Boosting is a plan feature — the same gate the Boost button uses.
    if (!(await userCanFeature(userId, "boost"))) {
      return NextResponse.json({ error: "Post boosting isn't enabled for your account." }, { status: 403 });
    }
    const b = parsed.data;
    const r = await createBoost({
      userId,
      postId: b.postId,
      budgetPoints: b.budgetPoints,
      durationDays: b.durationDays,
      targeting: b.targeting ? normalizeTargeting(b.targeting as AdTargeting) : null,
      payFrom: b.payFrom,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ id: r.id, status: r.status });
  });
}
