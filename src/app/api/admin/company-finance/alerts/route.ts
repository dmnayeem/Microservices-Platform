import { NextRequest, NextResponse } from "next/server";
import { financeGuard, auditFinance } from "@/lib/company-finance/api";
import { prisma } from "@/lib/prisma";
import { invalidateSettingsCache, primeSetting } from "@/lib/system-settings";
import { getFinanceAlertSettings, runBillReminders, summariseBillReminders } from "@/lib/company-finance/alerts";
import { FINANCE_ALERTS_KEY, normalizeFinanceAlerts } from "@/lib/company-finance/alerts-shared";

export const runtime = "nodejs";

/**
 * Finance alerts — the switches on the Alerts tab of the company books.
 * GET: the current settings. POST `{ settings }`: save them. POST
 * `{ action: "run" }`: run the bill reminders now (sends only what is due and
 * not already sent — the same once-only keys as the scheduler).
 */
export async function GET() {
  const g = await financeGuard("finance.settings");
  if ("res" in g) return g.res;
  return NextResponse.json({ settings: await getFinanceAlertSettings() });
}

export async function POST(request: NextRequest) {
  const g = await financeGuard("finance.settings");
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as { settings?: unknown; action?: string };

  if (body.action === "run") {
    const s = await runBillReminders();
    return NextResponse.json({ ok: true, summary: summariseBillReminders(s), result: s });
  }

  const settings = normalizeFinanceAlerts(body.settings);
  await prisma.systemSetting.upsert({
    where: { key: FINANCE_ALERTS_KEY },
    create: { key: FINANCE_ALERTS_KEY, value: settings as never, category: "finance" },
    update: { value: settings as never, category: "finance" },
  });
  // Clear, then prime — reads go through an edge cache that is not ours to
  // clear, so without the prime the change would appear not to save.
  invalidateSettingsCache();
  primeSetting(FINANCE_ALERTS_KEY, settings);
  const off = Object.entries(settings)
    .filter(([, r]) => !r.enabled)
    .map(([k]) => k);
  await auditFinance(
    g.caller,
    "FINANCE_ALERTS_SET",
    "SystemSetting",
    FINANCE_ALERTS_KEY,
    off.length ? `Saved finance alerts (off: ${off.join(", ")})` : "Saved finance alerts (all on)"
  );
  return NextResponse.json({ ok: true, settings });
}
