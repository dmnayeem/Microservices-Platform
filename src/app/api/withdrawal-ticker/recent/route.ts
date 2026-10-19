import { NextResponse } from "next/server";
import { getTickerConfig, getRealTickerItems } from "@/lib/ticker-server";

/**
 * Recent paid withdrawals for the marquee ticker's 30s poll.
 *
 * Replaces the SSE stream, which held a serverless invocation open for five
 * minutes **per viewer** and ran an uncached query every 8 seconds inside each
 * one — for data that is byte-identical for everybody. At a few thousand
 * concurrent users that is thousands of held-open functions and thousands of
 * queries a minute to show the same list.
 *
 * One shared, cached query instead: whatever the concurrency, the database sees
 * roughly one read per TTL.
 *
 * Same rules as the first render (`getTickerPayload`): off → nothing, generated
 * only → nothing real, and the admin's amount/country filters apply. It used to
 * run its own query that ignored all of them, so a ticker set to "generated
 * only" still filled up with real payouts after 30 seconds.
 */
export async function GET() {
  const cfg = await getTickerConfig();
  if (!cfg.enabled || cfg.source === "GENERATED") {
    return NextResponse.json({ items: [] });
  }
  return NextResponse.json({ items: await getRealTickerItems(cfg) });
}
