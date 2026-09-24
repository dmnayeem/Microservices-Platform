import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  getLicenseTiersEnabled,
  setLicenseTiersEnabled,
  getPayoutHoldConfig,
  savePayoutHoldConfig,
  getMarketplaceTaxConfig,
  saveMarketplaceTaxConfig,
} from "@/lib/marketplace-selling";
import { z } from "zod";

/**
 * The two selling rules an admin can switch on: licence tiers, and holding a
 * seller's payout for a few days.
 *
 * Both are read on the money path of every sale, so the response also reports
 * how much is currently held — switching the hold off does not release what is
 * already waiting, and an owner turning it off deserves to see that rather
 * than discover it later.
 */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [licenseTiersEnabled, payoutHold, tax, held] = await Promise.all([
    getLicenseTiersEnabled(),
    getPayoutHoldConfig(),
    getMarketplaceTaxConfig(),
    prisma.marketplacePayout.aggregate({
      where: { status: "HELD" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({
    licenseTiersEnabled,
    payoutHold,
    tax,
    heldNow: {
      count: held._count._all,
      amount: Number(held._sum.amount ?? 0),
    },
  });
}

const schema = z.object({
  licenseTiersEnabled: z.boolean().optional(),
  payoutHold: z
    .object({
      enabled: z.boolean(),
      days: z.number().int().min(1).max(90),
    })
    .optional(),
  tax: z
    .object({
      enabled: z.boolean(),
      pct: z.number().min(0).max(100),
      label: z.string().min(1).max(20),
    })
    .optional(),
});

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
    return NextResponse.json({ error: "Invalid input", details: v.error.issues }, { status: 400 });
  }

  const before = {
    licenseTiersEnabled: await getLicenseTiersEnabled(),
    payoutHold: await getPayoutHoldConfig(),
    tax: await getMarketplaceTaxConfig(),
  };

  if (v.data.licenseTiersEnabled !== undefined) {
    await setLicenseTiersEnabled(v.data.licenseTiersEnabled);
  }
  if (v.data.payoutHold !== undefined) {
    await savePayoutHoldConfig(v.data.payoutHold);
  }
  if (v.data.tax !== undefined) {
    await saveMarketplaceTaxConfig(v.data.tax);
  }

  const after = {
    licenseTiersEnabled: await getLicenseTiersEnabled(),
    payoutHold: await getPayoutHoldConfig(),
    tax: await getMarketplaceTaxConfig(),
  };

  await writeAudit({
    actorId: session.user.id,
    action: "MARKETPLACE_SELLING_RULES_UPDATE",
    entity: "SystemSetting",
    entityId: "marketplace_selling_rules",
    summary: [
      before.licenseTiersEnabled !== after.licenseTiersEnabled
        ? `Licence tiers ${after.licenseTiersEnabled ? "on" : "off"}`
        : null,
      before.payoutHold.enabled !== after.payoutHold.enabled ||
      before.payoutHold.days !== after.payoutHold.days
        ? `Payout hold ${after.payoutHold.enabled ? `on, ${after.payoutHold.days} day(s)` : "off"}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || "No change",
    meta: { before, after },
  });

  return NextResponse.json({ ...after });
}
