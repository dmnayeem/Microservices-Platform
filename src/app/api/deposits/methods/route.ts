import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEnabledDepositMethods } from "@/lib/deposit-methods";
import { getCurrencyForCountry } from "@/lib/currencies";
import { getSetting } from "@/lib/system-settings";

// GET /api/deposits/methods — enabled manual/Binance methods a user can pay to
// (label + receiving account + instructions + limits + per-method charge), plus
// the user's local currency (by country) and the VAT config, so the deposit
// page can show the converted amount + charge + VAT breakdown.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [methods, me, vatEnabled, vatPct] = await Promise.all([
    getEnabledDepositMethods(),
    prisma.user
      .findUnique({
        where: { id: session.user.id },
        select: { country: true },
        cacheStrategy: { ttl: 300, swr: 600 },
      })
      .catch(() => null),
    getSetting<boolean>("vat_enabled", false),
    getSetting<number>("vat_pct", 15),
  ]);

  const currency = await getCurrencyForCountry(me?.country);

  return NextResponse.json({
    methods,
    currency,
    vat: { enabled: !!vatEnabled, pct: Number(vatPct) || 0 },
  });
}
