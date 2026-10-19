import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  TICKER_DEFAULTS,
  TICKER_KEY_PREFIX,
  TICKER_SOURCES,
  clearTickerConfigCache,
  type TickerConfig,
} from "@/lib/ticker-server";

/**
 * Saves the withdrawal ticker settings. Gated on `ticker.edit` — the page's own
 * permission. It used to post to /api/admin/settings, which wants
 * `settings.edit`, so a role granted only the ticker could open the page and
 * then be refused on every save.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "ticker.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Partial<TickerConfig> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Only known keys, each with the type its default has.
  const clean: Partial<TickerConfig> = {};
  for (const k of Object.keys(TICKER_DEFAULTS) as (keyof TickerConfig)[]) {
    if (!(k in body)) continue;
    const val = body[k];
    if (typeof val !== typeof TICKER_DEFAULTS[k]) {
      return NextResponse.json({ error: `Invalid value for ${k}` }, { status: 400 });
    }
    if (typeof val === "number" && !Number.isFinite(val)) {
      return NextResponse.json({ error: `Invalid value for ${k}` }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (clean as any)[k] = typeof val === "string" ? val.trim().slice(0, 500) : val;
  }

  if (clean.source !== undefined && !TICKER_SOURCES.includes(clean.source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }
  if (clean.max_items !== undefined && (clean.max_items < 1 || clean.max_items > 50)) {
    return NextResponse.json({ error: "Max entries must be 1–50" }, { status: 400 });
  }
  if (clean.scroll_speed_ms !== undefined && clean.scroll_speed_ms < 5000) {
    return NextResponse.json({ error: "Scroll speed must be at least 5000 ms" }, { status: 400 });
  }
  for (const k of ["fake_min_amount", "fake_max_amount", "min_amount_to_show"] as const) {
    if (clean[k] !== undefined && clean[k]! < 0) {
      return NextResponse.json({ error: "Amounts cannot be negative" }, { status: 400 });
    }
  }
  if (
    clean.fake_min_amount !== undefined &&
    clean.fake_max_amount !== undefined &&
    clean.fake_max_amount < clean.fake_min_amount
  ) {
    return NextResponse.json(
      { error: "Generated max amount must be at least the min amount" },
      { status: 400 }
    );
  }

  const entries = Object.entries(clean);
  await prisma.$transaction(
    entries.map(([k, value]) =>
      prisma.systemSetting.upsert({
        where: { key: `${TICKER_KEY_PREFIX}${k}` },
        create: { key: `${TICKER_KEY_PREFIX}${k}`, value: value as never, category: "ticker" },
        update: { value: value as never, category: "ticker" },
      })
    )
  );
  clearTickerConfigCache();

  await writeAudit({
    actorId: session.user.id,
    action: "TICKER_SETTINGS_UPDATED",
    entity: "SystemSetting",
    entityId: "ticker",
    summary: `Withdrawal ticker: ${clean.enabled === false ? "off" : `on, ${clean.source ?? "unchanged source"}`}`,
    meta: clean as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}
