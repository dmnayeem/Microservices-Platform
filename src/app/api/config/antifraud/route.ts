import { NextResponse } from "next/server";
import { getFraudConfig } from "@/lib/fraud";

// GET /api/config/antifraud — public-safe client config for the adblock gate.
// (adblock.ts runs client-side and can't read SystemSettings directly.)
export async function GET() {
  const cfg = await getFraudConfig();
  return NextResponse.json({
    adblockGateEnabled: cfg.adblockGateEnabled,
    adblockReminderMinutes: cfg.adblockReminderMinutes,
  });
}
