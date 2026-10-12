import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import { financeGuard, auditFinance } from "@/lib/company-finance/api";
import { getRevenueBreakdown } from "@/lib/finance/revenue";
import {
  dayKey,
  floorDay,
  monthEnd,
  parseDay,
  periodDays,
  periodOf,
  thirdPartyDaily,
  thirdPartyIncome,
} from "@/lib/finance/platform-income";
import { AD_NETWORKS } from "@/lib/ad-networks/registry";

export const runtime = "nodejs";

/**
 * Finance → Platform income.
 *
 * GET  ?view=day&date=YYYY-MM-DD   platforms + that day's figures (entry screen)
 * GET  ?view=month&period=YYYY-MM  month-end: daily total vs actual payout
 * GET  ?view=report&from=&to=      own revenue + third-party, per day
 * GET  ?view=csv&from=&to=         every daily figure as CSV
 * POST { action, … }               see the switch below
 *
 * Permissions: reading needs `finance.view`; typing daily figures
 * `finance.entries.create`; voiding a figure and recording a payout
 * `finance.entries.approve`; adding / changing platforms `finance.settings`.
 * Every write is audited with the old and new value.
 */

const MAX_USD = 10_000_000;
const MAX_REPORT_DAYS = 400;

/**
 * The platform's OWN income is measured, never typed. A "platform" named like
 * one of those streams would count the same money twice, so it is refused.
 */
const OWN_INCOME_WORDS = [
  "marketplace",
  "course",
  "subscription",
  "blue badge",
  "badge",
  "boost",
  "spotlight",
  "withdrawal fee",
  "lottery",
  "escrow",
  "mediation",
  "ad space",
  "revtype",
];

function ownIncomeName(name: string): string | null {
  const n = name.toLowerCase();
  return OWN_INCOME_WORDS.find((w) => n === w || n.includes(w)) ?? null;
}

/** A USD amount with at most 2 decimals, 0 ≤ x ≤ MAX. Null = invalid. */
function money(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.trim()) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < 0 || n > MAX_USD) return null;
  // More than cents is a typo or a pasted rate, not an amount.
  const cents = n * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-6) return null;
  return Math.round(cents) / 100;
}

/** Latest day income may be entered for: today in the furthest-ahead
 *  timezone we serve (UTC+14 covers everyone — Bangladesh is UTC+6). */
function latestAllowedDay(): Date {
  return floorDay(new Date(Date.now() + 14 * 3_600_000));
}

const clean = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function GET(request: NextRequest) {
  const g = await financeGuard("finance.view");
  if ("res" in g) return g.res;
  const sp = request.nextUrl.searchParams;
  const view = sp.get("view") ?? "day";

  if (view === "day") {
    const date = parseDay(sp.get("date")) ?? floorDay(new Date());
    const since = new Date(date.getTime() - 30 * 86_400_000);
    const [platforms, entries, recent] = await Promise.all([
      prisma.incomePlatform.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
      prisma.platformIncomeEntry.findMany({ where: { date } }),
      // 30-day average per platform (days with a figure), for the "is this a
      // typo?" check before saving an unusually large number.
      prisma.platformIncomeEntry.groupBy({
        by: ["platformId"],
        where: { status: "ACTIVE", date: { gte: since, lt: date } },
        _avg: { amountUsd: true },
      }) as unknown as Promise<{ platformId: string; _avg: { amountUsd: unknown } }[]>,
    ]);
    return NextResponse.json({
      date: dayKey(date),
      latestDay: dayKey(latestAllowedDay()),
      can: {
        enter: g.caller.can("finance.entries.create"),
        approve: g.caller.can("finance.entries.approve"),
        settings: g.caller.can("finance.settings"),
      },
      networks: AD_NETWORKS.filter((n) => n.id !== "custom").map((n) => ({ id: n.id, name: n.name })),
      platforms: platforms.map((p) => {
        const e = entries.find((x) => x.platformId === p.id);
        const avg = recent.find((x) => x.platformId === p.id);
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          color: p.color,
          networkKey: p.networkKey,
          isActive: p.isActive,
          avg30: avg ? toNum(avg._avg.amountUsd as never) : null,
          entry: e
            ? {
                id: e.id,
                amountUsd: toNum(e.amountUsd as never),
                note: e.note,
                status: e.status,
                voidReason: e.voidReason,
                updatedAt: e.updatedAt.toISOString(),
              }
            : null,
        };
      }),
    });
  }

  if (view === "month") {
    const period = sp.get("period") ?? periodOf(new Date());
    const rows = await monthEnd(period);
    if (!rows) return NextResponse.json({ error: "Pick a month" }, { status: 400 });
    return NextResponse.json({ period, rows, canApprove: g.caller.can("finance.entries.approve") });
  }

  if (view === "report" || view === "csv") {
    const from = parseDay(sp.get("from"));
    const to = parseDay(sp.get("to"));
    if (!from || !to || from > to) return NextResponse.json({ error: "Pick a valid date range" }, { status: 400 });
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_REPORT_DAYS * 3) {
      return NextResponse.json({ error: "Pick a range of at most three years" }, { status: 400 });
    }

    if (view === "csv") {
      // Accelerate's types drop `include`; the shape is restated.
      const rows = (await prisma.platformIncomeEntry.findMany({
        where: { date: { gte: from, lte: to } },
        include: { platform: { select: { name: true, type: true } } },
        orderBy: [{ date: "asc" }, { platform: { name: "asc" } }],
      })) as unknown as {
        date: Date;
        amountUsd: unknown;
        status: string;
        note: string | null;
        voidReason: string | null;
        platform: { name: string; type: string };
      }[];
      const payouts = (await prisma.platformPayout.findMany({
        include: { platform: { select: { name: true } } },
        orderBy: { period: "asc" },
      })) as unknown as {
        period: string;
        actualUsd: unknown;
        receivedAt: Date | null;
        reference: string | null;
        platform: { name: string };
      }[];
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [
        "date,platform,type,amount_usd,status,note,void_reason",
        ...rows.map((r) =>
          [dayKey(r.date), r.platform.name, r.platform.type, toNum(r.amountUsd as never).toFixed(2), r.status, r.note, r.voidReason]
            .map(esc)
            .join(",")
        ),
        "",
        "month,platform,actual_payout_usd,received_at,reference",
        ...payouts
          .filter((p) => {
            const d = periodDays(p.period);
            return d && d.last >= from && d.first <= to;
          })
          .map((p) =>
            [p.period, p.platform.name, toNum(p.actualUsd as never).toFixed(2), p.receivedAt ? dayKey(p.receivedAt) : "", p.reference]
              .map(esc)
              .join(",")
          ),
      ];
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="platform-income-${dayKey(from)}-to-${dayKey(to)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // The whole range, inclusive of the last day.
    const end = new Date(to.getTime() + 86_400_000 - 1);
    const [revenue, third, daily] = await Promise.all([
      getRevenueBreakdown({ from, to: end }),
      thirdPartyIncome({ from, to }),
      (to.getTime() - from.getTime()) / 86_400_000 <= MAX_REPORT_DAYS
        ? thirdPartyDaily(from, to)
        : Promise.resolve(null),
    ]);
    return NextResponse.json({
      from: dayKey(from),
      to: dayKey(to),
      own: {
        usd: revenue.platformUsd,
        streams: revenue.streams
          .filter((s) => s.group === "platform")
          .map((s) => ({ key: s.key, label: s.label, usd: s.usd, count: s.count, measured: s.measured })),
      },
      thirdParty: third,
      totalUsd: revenue.totalUsd,
      daily,
    });
  }

  return NextResponse.json({ error: "Unknown view" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  // ── Platforms ────────────────────────────────────────────────────────────
  if (action === "platform.create" || action === "platform.update") {
    const g = await financeGuard("finance.settings");
    if ("res" in g) return g.res;
    const name = clean(body.name, 80);
    const type = clean(body.type, 40) ?? "Ad network";
    const color = clean(body.color, 9);
    const networkKey = clean(body.networkKey, 40);
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) return NextResponse.json({ error: "Colour must be like #22c55e" }, { status: 400 });
    if (networkKey && !AD_NETWORKS.some((n) => n.id === networkKey)) {
      return NextResponse.json({ error: "Unknown ad network" }, { status: 400 });
    }
    if (name) {
      const own = ownIncomeName(name);
      if (own) {
        return NextResponse.json(
          {
            error: `"${name}" looks like the platform's own income (${own}). That is counted automatically — only outside companies like Google AdSense or Adsterra are entered here.`,
          },
          { status: 400 }
        );
      }
    }

    if (action === "platform.create") {
      if (!name) return NextResponse.json({ error: "Enter the company name" }, { status: 400 });
      const clash = await prisma.incomePlatform.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
      if (clash) return NextResponse.json({ error: `"${clash.name}" already exists` }, { status: 409 });
      if (networkKey && (await prisma.incomePlatform.findFirst({ where: { networkKey } }))) {
        return NextResponse.json({ error: "Another platform is already linked to that network" }, { status: 409 });
      }
      const p = await prisma.incomePlatform.create({
        data: { name, type, color, networkKey, createdById: g.caller.id },
      });
      await auditFinance(g.caller, "PLATFORM_CREATED", "IncomePlatform", p.id, `Added income platform "${name}" (${type})`, {
        name,
        type,
        networkKey,
      });
      return NextResponse.json({ ok: true, platform: p });
    }

    const id = clean(body.id, 40);
    const existing = id ? await prisma.incomePlatform.findUnique({ where: { id } }) : null;
    if (!existing) return NextResponse.json({ error: "Platform not found" }, { status: 404 });
    if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
      const clash = await prisma.incomePlatform.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, id: { not: existing.id } },
      });
      if (clash) return NextResponse.json({ error: `"${clash.name}" already exists` }, { status: 409 });
    }
    if (networkKey && networkKey !== existing.networkKey) {
      const taken = await prisma.incomePlatform.findFirst({ where: { networkKey, id: { not: existing.id } } });
      if (taken) return NextResponse.json({ error: `"${taken.name}" is already linked to that network` }, { status: 409 });
    }
    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (body.type !== undefined) data.type = type;
    if (body.color !== undefined) data.color = color;
    if (body.networkKey !== undefined) data.networkKey = networkKey;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    const p = await prisma.incomePlatform.update({ where: { id: existing.id }, data });
    await auditFinance(g.caller, "PLATFORM_UPDATED", "IncomePlatform", p.id, `Changed income platform "${p.name}"`, {
      before: { name: existing.name, type: existing.type, networkKey: existing.networkKey, isActive: existing.isActive },
      after: { name: p.name, type: p.type, networkKey: p.networkKey, isActive: p.isActive },
    });
    return NextResponse.json({ ok: true, platform: p });
  }

  // ── Daily figures ────────────────────────────────────────────────────────
  if (action === "entries.save") {
    const g = await financeGuard("finance.entries.create");
    if ("res" in g) return g.res;
    const date = parseDay(body.date);
    if (!date) return NextResponse.json({ error: "Pick a date" }, { status: 400 });
    if (date > latestAllowedDay()) return NextResponse.json({ error: "That date is in the future" }, { status: 400 });
    const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
    if (rows.length === 0 || rows.length > 200) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });

    // Validate everything before writing anything.
    const parsed: { platformId: string; amountUsd: number; note: string | null }[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const platformId = clean(r.platformId, 40);
      if (!platformId || seen.has(platformId)) return NextResponse.json({ error: "Each platform once per save" }, { status: 400 });
      seen.add(platformId);
      const amountUsd = money(r.amountUsd);
      if (amountUsd === null) {
        return NextResponse.json({ error: "Amounts must be dollars ≥ 0 with at most 2 decimals (e.g. 12.50)" }, { status: 400 });
      }
      parsed.push({ platformId, amountUsd, note: clean(r.note, 300) });
    }
    const platforms = await prisma.incomePlatform.findMany({ where: { id: { in: [...seen] } } });
    const byId = new Map(platforms.map((p) => [p.id, p]));
    for (const r of parsed) {
      const p = byId.get(r.platformId);
      if (!p) return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
      if (!p.isActive) return NextResponse.json({ error: `"${p.name}" is switched off — switch it on to enter income` }, { status: 400 });
    }

    // Typo guard: ≥ 10× the platform's 30-day average (and over $50) needs a
    // second, explicit confirmation — one extra zero is the classic mistake.
    if (body.confirmLarge !== true) {
      const since = new Date(date.getTime() - 30 * 86_400_000);
      const avgs = (await prisma.platformIncomeEntry.groupBy({
        by: ["platformId"],
        where: { status: "ACTIVE", platformId: { in: [...seen] }, date: { gte: since, lt: date } },
        _avg: { amountUsd: true },
      })) as unknown as { platformId: string; _avg: { amountUsd: unknown } }[];
      const warnings = parsed
        .map((r) => {
          const avg = toNum(avgs.find((a) => a.platformId === r.platformId)?._avg.amountUsd as never);
          return avg > 0 && r.amountUsd > 50 && r.amountUsd >= avg * 10
            ? `${byId.get(r.platformId)!.name}: ${usd(r.amountUsd)} is ${Math.round(r.amountUsd / avg)}× its 30-day average (${usd(avg)})`
            : null;
        })
        .filter((w): w is string => !!w);
      if (warnings.length) return NextResponse.json({ needsConfirm: true, warnings }, { status: 409 });
    }

    // One row per platform per day: replace, never add. In one transaction.
    const existing = await prisma.platformIncomeEntry.findMany({
      where: { date, platformId: { in: [...seen] } },
    });
    const changes: { name: string; from: number | null; to: number; revived: boolean }[] = [];
    await prisma.$transaction(
      parsed.map((r) => {
        const e = existing.find((x) => x.platformId === r.platformId);
        const before = e ? toNum(e.amountUsd as never) : null;
        if (!e || before !== r.amountUsd || e.status !== "ACTIVE" || (e.note ?? null) !== r.note) {
          changes.push({ name: byId.get(r.platformId)!.name, from: e?.status === "ACTIVE" ? before : null, to: r.amountUsd, revived: e?.status === "VOID" });
        }
        return prisma.platformIncomeEntry.upsert({
          where: { platformId_date: { platformId: r.platformId, date } },
          create: { platformId: r.platformId, date, amountUsd: r.amountUsd, note: r.note, enteredById: g.caller.id, updatedById: g.caller.id },
          update: { amountUsd: r.amountUsd, note: r.note, status: "ACTIVE", voidReason: null, updatedById: g.caller.id },
        });
      })
    );
    if (changes.length) {
      await auditFinance(
        g.caller,
        "PLATFORM_INCOME_SAVED",
        "PlatformIncomeEntry",
        null,
        `Platform income for ${dayKey(date)}: ` +
          changes.map((c) => `${c.name} ${c.from === null ? "" : `${usd(c.from)} → `}${usd(c.to)}`).join(", "),
        { date: dayKey(date), changes }
      );
    }
    return NextResponse.json({ ok: true, saved: parsed.length, changed: changes.length });
  }

  if (action === "entry.void") {
    const g = await financeGuard("finance.entries.approve");
    if ("res" in g) return g.res;
    const id = clean(body.id, 40);
    const reason = clean(body.reason, 300);
    if (!reason) return NextResponse.json({ error: "Say why it is being voided" }, { status: 400 });
    const e = id ? await prisma.platformIncomeEntry.findUnique({ where: { id }, include: { platform: true } }) : null;
    if (!e) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    if (e.status === "VOID") return NextResponse.json({ error: "Already voided" }, { status: 409 });
    const moved = await prisma.platformIncomeEntry.updateMany({
      where: { id: e.id, status: "ACTIVE" },
      data: { status: "VOID", voidReason: reason, updatedById: g.caller.id },
    });
    if (moved.count === 0) return NextResponse.json({ error: "Already voided" }, { status: 409 });
    await auditFinance(
      g.caller,
      "PLATFORM_INCOME_VOIDED",
      "PlatformIncomeEntry",
      e.id,
      `Voided ${e.platform.name} ${usd(toNum(e.amountUsd as never))} for ${dayKey(e.date)} — ${reason}`,
      { reason }
    );
    return NextResponse.json({ ok: true });
  }

  // ── Month-end actual payout ──────────────────────────────────────────────
  if (action === "payout.save") {
    const g = await financeGuard("finance.entries.approve");
    if ("res" in g) return g.res;
    const platformId = clean(body.platformId, 40);
    const period = clean(body.period, 7) ?? "";
    const days = periodDays(period);
    if (!days) return NextResponse.json({ error: "Pick a month" }, { status: 400 });
    if (days.first > latestAllowedDay()) return NextResponse.json({ error: "That month has not started" }, { status: 400 });
    const actualUsd = money(body.actualUsd);
    if (actualUsd === null) return NextResponse.json({ error: "Enter the amount actually paid, in dollars" }, { status: 400 });
    const receivedAt = body.receivedAt ? parseDay(body.receivedAt) : null;
    if (body.receivedAt && !receivedAt) return NextResponse.json({ error: "Received date is not a valid date" }, { status: 400 });
    const platform = platformId ? await prisma.incomePlatform.findUnique({ where: { id: platformId } }) : null;
    if (!platform) return NextResponse.json({ error: "Platform not found" }, { status: 404 });
    const before = await prisma.platformPayout.findUnique({ where: { platformId_period: { platformId: platform.id, period } } });
    const p = await prisma.platformPayout.upsert({
      where: { platformId_period: { platformId: platform.id, period } },
      create: {
        platformId: platform.id,
        period,
        actualUsd,
        receivedAt,
        reference: clean(body.reference, 120),
        note: clean(body.note, 300),
        enteredById: g.caller.id,
        updatedById: g.caller.id,
      },
      update: {
        actualUsd,
        receivedAt,
        reference: clean(body.reference, 120),
        note: clean(body.note, 300),
        updatedById: g.caller.id,
      },
    });
    await auditFinance(
      g.caller,
      "PLATFORM_PAYOUT_SAVED",
      "PlatformPayout",
      p.id,
      `${platform.name} actual payout for ${period}: ${before ? `${usd(toNum(before.actualUsd as never))} → ` : ""}${usd(actualUsd)}`,
      { period, from: before ? toNum(before.actualUsd as never) : null, to: actualUsd }
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
