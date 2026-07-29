import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPromotionPricing } from "@/lib/promotion";

/** Promotion packages for the "Promote" sheet (any authed user). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const packages = await getPromotionPricing();
  return NextResponse.json({ packages });
}
