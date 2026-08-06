import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getCommissionConfig,
  saveCommissionConfig,
  type CommissionRatesConfig,
} from "@/lib/marketplace-commission";
import { z } from "zod";

// GET /api/admin/marketplace/commission
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "marketplace.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const config = await getCommissionConfig();
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

const schema = z.object({
  default: z.number().int().min(0).max(10000),
  byAssetType: z
    .record(z.string(), z.number().int().min(0).max(10000))
    .optional(),
});

// PATCH /api/admin/marketplace/commission
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "marketplace.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const v = schema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const cfg: CommissionRatesConfig = {
      default: v.data.default,
      byAssetType: v.data.byAssetType ?? {},
    };
    await saveCommissionConfig(cfg);
    return NextResponse.json({ config: cfg });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
