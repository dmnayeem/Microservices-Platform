import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { realMeasurementSince } from "@/lib/ad-measure";
import { IVT_REASON_LABELS } from "@/lib/ad-ivt";

/**
 * GET /api/admin/ads/measurement?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv&scope=ad|placement|network|day|reasons]
 *
 * The real-measurement ad report, read from `AdMeasureDaily` (rebuilt from raw
 * events every 10 minutes by the `ad-measure-rollup` job). Every figure here is
 * after bot / invalid traffic was excluded; the excluded traffic is reported
 * beside it, with its reasons. Spend is shown only to finance viewers, and only
 * for paid (non-house, non-network) ads — the same revenue gate as the rest of
 * the ad report.
 */

type Row = {
  served: number;
  validViews: number;
  invalidViews: number;
  internalViews: number;
  validClicks: number;
  invalidClicks: number;
  internalClicks: number;
  estClicks: number;
  invalidEstClicks: number;
  scriptExecs: number;
  invalidScriptExecs: number;
  spend: number;
};
const zero = (): Row => ({
  served: 0,
  validViews: 0,
  invalidViews: 0,
  internalViews: 0,
  validClicks: 0,
  invalidClicks: 0,
  internalClicks: 0,
  estClicks: 0,
  invalidEstClicks: 0,
  scriptExecs: 0,
  invalidScriptExecs: 0,
  spend: 0,
});

function shape<T extends Row>(r: T) {
  const invalid = r.invalidViews + r.invalidClicks + r.invalidEstClicks + r.invalidScriptExecs;
  return {
    ...r,
    invalidTotal: invalid,
    viewabilityPct: r.served > 0 ? Math.min(100, ((r.validViews + r.internalViews) / r.served) * 100) : null,
    ctrPct: r.validViews > 0 ? (r.validClicks / r.validViews) * 100 : null,
    estCtrPct: r.validViews > 0 ? (r.estClicks / r.validViews) * 100 : null,
  };
}

function parseDay(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** CSV cell, quoted when needed and neutralised against spreadsheet formulas. */
function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const seesMoney = await can(session.user.id, "finance.view");

  const sp = req.nextUrl.searchParams;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let to = parseDay(sp.get("to")) ?? today;
  let from = parseDay(sp.get("from")) ?? new Date(to.getTime() - 13 * 86_400_000);
  if (from > to) [from, to] = [to, from];
  // At most a year per request.
  if (to.getTime() - from.getTime() > 366 * 86_400_000) from = new Date(to.getTime() - 366 * 86_400_000);

  const rows = await prisma.adMeasureDaily.findMany({
    where: { date: { gte: from, lte: to } },
    select: {
      adId: true,
      placement: true,
      network: true,
      date: true,
      served: true,
      validViews: true,
      invalidViews: true,
      internalViews: true,
      validClicks: true,
      invalidClicks: true,
      internalClicks: true,
      estClicks: true,
      invalidEstClicks: true,
      scriptExecs: true,
      invalidScriptExecs: true,
      spendUsd: true,
      invalidReasons: true,
    },
  });

  const adIds = [...new Set(rows.map((r) => r.adId).filter((id) => id !== "-"))];
  const ads = adIds.length
    ? await prisma.ad.findMany({
        where: { id: { in: adIds } },
        select: {
          id: true,
          type: true,
          brandName: true,
          headline: true,
          campaign: { select: { title: true, isHouse: true } },
        },
      })
    : [];
  const adMap = new Map(ads.map((a) => [a.id, a]));

  type AdAgg = Row & { adId: string; label: string; type: string; placement: string; network: string; house: boolean };
  const perAd = new Map<string, AdAgg>();
  const perPlacement = new Map<string, Row & { placement: string }>();
  const perNetwork = new Map<string, Row & { network: string }>();
  const perDay = new Map<string, Row & { date: string }>();
  const reasons = new Map<string, number>();
  const totals = zero();

  for (const r of rows) {
    const a = adMap.get(r.adId);
    const paid = !!a && !a.campaign?.isHouse && a.type !== "ADSENSE" && a.type !== "GAM";
    const spend = seesMoney && paid ? toNum(r.spendUsd) : 0;
    const bump = (t: Row) => {
      t.served += r.served;
      t.validViews += r.validViews;
      t.invalidViews += r.invalidViews;
      t.internalViews += r.internalViews;
      t.validClicks += r.validClicks;
      t.invalidClicks += r.invalidClicks;
      t.internalClicks += r.internalClicks;
      t.estClicks += r.estClicks;
      t.invalidEstClicks += r.invalidEstClicks;
      t.scriptExecs += r.scriptExecs;
      t.invalidScriptExecs += r.invalidScriptExecs;
      t.spend += spend;
    };
    bump(totals);

    const adKey = `${r.adId}|${r.placement}|${r.network}`;
    let ad = perAd.get(adKey);
    if (!ad) {
      const creative = (a?.brandName || a?.headline || "").slice(0, 40);
      ad = {
        ...zero(),
        adId: r.adId,
        label:
          r.adId === "-"
            ? "Unattributed (forged / garbled token)"
            : a
              ? `${a.campaign?.title ?? "—"}${creative ? ` · ${creative}` : ""}`
              : "(deleted ad)",
        type: a?.type ?? "—",
        placement: r.placement,
        network: r.network,
        house: !!a?.campaign?.isHouse,
      };
      perAd.set(adKey, ad);
    }
    bump(ad);

    let pl = perPlacement.get(r.placement);
    if (!pl) perPlacement.set(r.placement, (pl = { ...zero(), placement: r.placement }));
    bump(pl);
    let nw = perNetwork.get(r.network);
    if (!nw) perNetwork.set(r.network, (nw = { ...zero(), network: r.network }));
    bump(nw);
    const dk = r.date.toISOString().slice(0, 10);
    let dy = perDay.get(dk);
    if (!dy) perDay.set(dk, (dy = { ...zero(), date: dk }));
    bump(dy);

    const ir = (r.invalidReasons ?? {}) as Record<string, number>;
    for (const [k, v] of Object.entries(ir)) reasons.set(k, (reasons.get(k) ?? 0) + (Number(v) || 0));
  }

  // Network-reported revenue (entered by hand) for eCPM — money, so finance only.
  const netRevenue = new Map<string, number>();
  if (seesMoney) {
    const rev = (await prisma.adNetworkRevenue.groupBy({
      by: ["network"],
      where: { date: { gte: from, lte: to } },
      _sum: { revenueUsd: true },
    })) as unknown as Array<{ network: string; _sum: { revenueUsd: unknown } }>;
    for (const r of rev) netRevenue.set(r.network, toNum(r._sum.revenueUsd as never));
  }

  const byViews = <T extends Row>(m: Map<string, T>) =>
    [...m.values()].map(shape).sort((x, y) => y.validViews - x.validViews || y.served - x.served);
  const out = {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    measuredSince: await realMeasurementSince(),
    seesMoney,
    totals: shape(totals),
    perAd: byViews(perAd),
    perPlacement: byViews(perPlacement),
    perNetwork: byViews(perNetwork).map((r) => {
      const revenue = netRevenue.get(r.network);
      return {
        ...r,
        networkRevenueUsd: revenue ?? null,
        ecpmUsd: revenue != null && r.validViews > 0 ? (revenue / r.validViews) * 1000 : null,
      };
    }),
    perDay: [...perDay.values()].map(shape).sort((x, y) => x.date.localeCompare(y.date)),
    topReasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, label: IVT_REASON_LABELS[reason] ?? reason, count }))
      .sort((x, y) => y.count - x.count),
  };

  if (sp.get("format") !== "csv") return NextResponse.json(out);

  const scope = sp.get("scope") ?? "ad";
  const head = [
    "Served",
    "Viewable impressions (valid)",
    "Viewability %",
    "Clicks (valid)",
    "CTR %",
    "Estimated clicks (3rd-party)",
    "Script executions",
    "Staff impressions",
    "Staff clicks",
    "Invalid impressions",
    "Invalid clicks",
    "Invalid est. clicks",
    "Invalid script execs",
    ...(seesMoney ? ["Spend USD (paid ads)"] : []),
  ];
  const nums = (r: ReturnType<typeof shape>) => [
    r.served,
    r.validViews,
    r.viewabilityPct == null ? "" : r.viewabilityPct.toFixed(1),
    r.validClicks,
    r.ctrPct == null ? "" : r.ctrPct.toFixed(2),
    r.estClicks,
    r.scriptExecs,
    r.internalViews,
    r.internalClicks,
    r.invalidViews,
    r.invalidClicks,
    r.invalidEstClicks,
    r.invalidScriptExecs,
    ...(seesMoney ? [r.spend.toFixed(2)] : []),
  ];
  let lines: unknown[][];
  if (scope === "placement") lines = [["Placement", ...head], ...out.perPlacement.map((r) => [r.placement, ...nums(r)])];
  else if (scope === "network")
    lines = [
      ["Network", ...head, ...(seesMoney ? ["Network-reported revenue USD", "eCPM USD"] : [])],
      ...out.perNetwork.map((r) => [
        r.network,
        ...nums(r),
        ...(seesMoney
          ? [r.networkRevenueUsd == null ? "" : r.networkRevenueUsd.toFixed(2), r.ecpmUsd == null ? "" : r.ecpmUsd.toFixed(2)]
          : []),
      ]),
    ];
  else if (scope === "day") lines = [["Date", ...head], ...out.perDay.map((r) => [r.date, ...nums(r)])];
  else if (scope === "reasons")
    lines = [["Reason", "Code", "Events filtered"], ...out.topReasons.map((r) => [r.label, r.reason, r.count])];
  else
    lines = [
      ["Ad id", "Ad", "Type", "Placement", "Network", ...head],
      ...out.perAd.map((r) => [r.adId, r.label, r.type, r.placement, r.network, ...nums(r)]),
    ];
  const csv =
    `# Bot/invalid traffic excluded. Range ${out.from} to ${out.to} (UTC). Real measurement since ${out.measuredSince ?? "-"}.\n` +
    lines.map((l) => l.map(csvCell).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ad-measurement-${scope}-${out.from}_${out.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
