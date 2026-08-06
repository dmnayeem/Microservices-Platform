import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPromotionPricing, savePromotionPricing } from "@/lib/promotion";
import { z } from "zod";

// GET /api/admin/marketplace/promotion-pricing
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ packages: await getPromotionPricing() });
}

const schema = z.object({
  packages: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        label: z.string().min(1).max(60),
        days: z.number().int().min(1).max(365),
        priceCash: z.number().min(0),
        pricePoints: z.number().int().min(0),
      })
    )
    .min(1)
    .max(10),
});

// PATCH /api/admin/marketplace/promotion-pricing
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const v = schema.safeParse(await request.json().catch(() => ({})));
  if (!v.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  await savePromotionPricing(v.data.packages);
  return NextResponse.json({ packages: await getPromotionPricing() });
}
