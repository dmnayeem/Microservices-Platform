import "server-only";
import { randomBytes } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { decodeAdServeToken, adViewerKey, type AdServeTokenPayload } from "@/lib/ad-serve-token";
import { viewerFromHeaders, type AdViewer } from "@/lib/ad-viewer";
import {
  getIvtSettings,
  judgeEvent,
  type ClientSignals,
  type MeasureKind,
} from "@/lib/ad-ivt";
import { bufferImpression } from "@/lib/ad-counters";
import { bumpAdDailyStat, todayUtc } from "@/lib/ad-stats";
import { clicksAreBillable, getPlacementClickCost } from "@/lib/ad-rate-card";
import { servableCampaignWhere } from "@/lib/ad-serve";
import { getFraudConfig, isVpnIp } from "@/lib/fraud";
import { isStaffRole } from "@/lib/staff";
import { UNKNOWN_COUNTRY } from "@/lib/ad-geo";
import { getSetting } from "@/lib/system-settings";

/**
 * Real ad measurement — ingestion, billing, rollup.
 *
 * ## What counts now
 *
 *  - **Served**: the ad was delivered (buffered counter, `AdMeasureDaily.served`).
 *    Not an impression.
 *  - **Viewable impression**: the browser returned the serve token after the
 *    ad was ≥50% on screen (≥30% for large creatives) for ≥1 continuous second
 *    on a visible page, and — for AdSense / Ad Manager — only once the unit
 *    actually filled. Valid ones feed the legacy `AdDailyStat.impressions`
 *    counters, so every existing report now shows viewable impressions.
 *  - **Click**: the browser navigated through `/api/spaces/go?st=…`. Recorded
 *    for signed-out viewers too; billed only when signed in (unchanged rule).
 *  - **Estimated click**: focus moved into a third-party ad iframe while the
 *    pointer was over it. Reported separately, never billed.
 *  - **Script execution**: a PAGE_SCRIPT ad's script loaded on a visible page.
 *
 * Each serve token counts at most once per kind (`AdEvent` unique
 * (nonce, kind)), so nothing — least of all a billed click — can be counted
 * twice for one delivery.
 */

export type IngestResult = {
  counted: boolean;
  valid: boolean;
  reason: string | null;
  billed: boolean;
  /** CLICK only: where to send the browser. */
  destination: string | null;
};

type AdRow = {
  id: string;
  status: string;
  targetUrl: string | null;
  promotedPostId: string | null;
  campaignId: string;
  placementId: string;
  placement: { name: string } | null;
  campaign: { isHouse: boolean; advertiserId: string | null } | null;
};

async function loadAd(adId: string): Promise<AdRow | null> {
  if (!adId || adId === "-") return null;
  return prisma.ad
    .findUnique({
      where: { id: adId },
      select: {
        id: true,
        status: true,
        targetUrl: true,
        promotedPostId: true,
        campaignId: true,
        placementId: true,
        placement: { select: { name: true } },
        campaign: { select: { isHouse: true, advertiserId: true } },
      },
      cacheStrategy: { ttl: 30, swr: 60 },
    })
    .catch(() => null);
}

/**
 * The ad's stored destination — never anything the request supplies, so the
 * click redirect cannot be used as an open redirect. Absolute http(s) URLs
 * and same-site paths only.
 */
export function adDestination(ad: Pick<AdRow, "targetUrl" | "promotedPostId"> | null): string | null {
  const raw = ad?.targetUrl?.trim();
  if (raw) {
    if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) return raw;
    try {
      const u = new URL(raw);
      if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    } catch {
      /* fall through */
    }
    return null;
  }
  if (ad?.promotedPostId) return `/post/${encodeURIComponent(ad.promotedPostId)}`;
  return null;
}

/** Destination for a click whose token could not be read: the named ad's stored URL. */
export async function fallbackDestination(adId: string | null): Promise<string | null> {
  if (!adId) return null;
  return adDestination(await loadAd(adId));
}

async function rateCounts(
  viewer: AdViewer,
  adId: string
): Promise<{ viewsLastMin: number; clicksLastHourSameAd: number; burst10s: number } | null> {
  const now = Date.now();
  const t1m = new Date(now - 60_000);
  const t1h = new Date(now - 3_600_000);
  const t10s = new Date(now - 10_000);
  try {
    const rows = await prisma.$queryRaw<
      { v: number; c: number; b: number }[]
    >(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "viewerHash" = ${viewer.viewerHash} AND "kind" = 'VIEW' AND "createdAt" > ${t1m})::int AS v,
        COUNT(*) FILTER (WHERE "viewerHash" = ${viewer.viewerHash} AND "kind" IN ('CLICK','EST_CLICK') AND "adId" = ${adId})::int AS c,
        COUNT(*) FILTER (WHERE "netHash" = ${viewer.netHash} AND "createdAt" > ${t10s})::int AS b
      FROM "AdEvent"
      WHERE ("viewerHash" = ${viewer.viewerHash} AND "createdAt" > ${t1h})
         OR ("netHash" = ${viewer.netHash} AND "createdAt" > ${t10s})
    `);
    const r = rows[0];
    return { viewsLastMin: Number(r?.v ?? 0), clicksLastHourSameAd: Number(r?.c ?? 0), burst10s: Number(r?.b ?? 0) };
  } catch {
    // A failed rate read must not make real traffic invalid.
    return null;
  }
}

async function isStaffUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const u = await prisma.user
    .findUnique({ where: { id: userId }, select: { role: true }, cacheStrategy: { ttl: 60, swr: 300 } })
    .catch(() => null);
  return isStaffRole(u?.role ?? null);
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}

async function writeEvent(data: {
  adId: string;
  placement: string;
  network: string;
  kind: MeasureKind;
  nonce: string;
  valid: boolean;
  reason: string | null;
  internal: boolean;
  viewer: AdViewer;
  country: string | null;
}): Promise<{ id: string } | "duplicate" | null> {
  try {
    return await prisma.adEvent.create({
      data: {
        adId: data.adId,
        placement: data.placement.slice(0, 64),
        network: data.network.slice(0, 40),
        kind: data.kind,
        nonce: data.nonce,
        valid: data.valid,
        reason: data.reason,
        internal: data.internal,
        viewerHash: data.viewer.viewerHash,
        netHash: data.viewer.netHash,
        userId: data.viewer.userId,
        country: data.country && data.country.length === 2 ? data.country : null,
      },
      select: { id: true },
    });
  } catch (e) {
    return isUniqueViolation(e) ? "duplicate" : null;
  }
}

/**
 * Judge and record one measured event. Never throws.
 *
 * `headers` is the beacon / click request's headers; `country` comes from
 * `resolveEventCountry` in the route (it reads the same request).
 */
export async function ingestAdEvent(opts: {
  st: unknown;
  kind: MeasureKind;
  signals: ClientSignals | null;
  headers: Headers;
  sessionUserId: string | null;
  country: string | null;
}): Promise<IngestResult> {
  const viewer = viewerFromHeaders(opts.headers, opts.sessionUserId);
  const none: IngestResult = { counted: false, valid: false, reason: null, billed: false, destination: null };

  const tok = decodeAdServeToken(opts.st);
  if (!tok.ok) {
    // Recorded against no ad — the token names nothing we can trust.
    await writeEvent({
      adId: "-",
      placement: "-",
      network: "-",
      kind: opts.kind,
      nonce: `x:${randomBytes(9).toString("base64url")}`,
      valid: false,
      reason: tok.reason,
      internal: false,
      viewer,
      country: opts.country,
    });
    return { ...none, reason: tok.reason };
  }
  const p: AdServeTokenPayload = tok.payload;
  const [ad, settings] = await Promise.all([loadAd(p.a), getIvtSettings()]);
  const destination = opts.kind === "CLICK" ? adDestination(ad) : null;

  let reason: string | null = null;
  if (!ad) {
    reason = "ad_not_found";
  } else {
    const needRate = settings.enabled && settings.rules.rate;
    const needVpn = settings.enabled && settings.rules.datacenter;
    const [rate, fraudCfg] = await Promise.all([
      needRate ? rateCounts(viewer, p.a) : Promise.resolve(null),
      needVpn ? getFraudConfig().catch(() => null) : Promise.resolve(null),
    ]);
    reason = judgeEvent(
      {
        kind: opts.kind,
        tokenAgeMs: Date.now() - p.t,
        tokenViewerKey: p.v,
        anonKeyNow: adViewerKey(null, viewer.ua),
        sessionUserId: opts.sessionUserId,
        ua: viewer.ua,
        signals: opts.signals,
        rate,
        advertiserId: ad.campaign?.advertiserId ?? null,
        datacenter: !!fraudCfg && isVpnIp(viewer.ip, fraudCfg),
      },
      settings
    );
  }
  const valid = reason === null;
  const internal = valid && (await isStaffUser(opts.sessionUserId));

  const row = await writeEvent({
    adId: p.a,
    placement: p.p,
    network: p.k,
    kind: opts.kind,
    nonce: p.n,
    valid,
    reason,
    internal,
    viewer,
    country: opts.country,
  });
  if (row === "duplicate") {
    // Same delivery, same kind, again. Kept as evidence, under its own nonce.
    await writeEvent({
      adId: p.a,
      placement: p.p,
      network: p.k,
      kind: opts.kind,
      nonce: `${p.n}#${randomBytes(6).toString("base64url")}`,
      valid: false,
      reason: "replayed",
      internal: false,
      viewer,
      country: opts.country,
    });
    return { ...none, reason: "replayed", destination };
  }
  if (!row) return { ...none, reason: "write_failed", destination };
  if (!valid || internal || !ad) return { counted: true, valid, reason, billed: false, destination };

  const country = opts.country || UNKNOWN_COUNTRY;
  if (opts.kind === "VIEW") {
    // The legacy counters (`Ad.impressions`, `AdDailyStat`, `AdCountryDailyStat`)
    // now carry VALID VIEWABLE impressions only — so the advertiser dashboard,
    // the finance console and every existing report read real numbers.
    bufferImpression(ad.id, country);
    return { counted: true, valid, reason, billed: false, destination };
  }
  if (opts.kind === "CLICK") {
    const billed = await billValidClick(ad, opts.sessionUserId, row.id, country);
    return { counted: true, valid, reason, billed, destination };
  }
  return { counted: true, valid, reason, billed: false, destination };
}

/**
 * Count (and when allowed, bill) one VALID click. Moved here from the old
 * `recordClick`: the token claim is now the `AdEvent` row itself, written
 * before this runs, so a token can never reach this twice.
 *
 * Rules unchanged: house ads and flat-rate (booked) spaces count but never
 * bill; only a signed-in viewer's click bills (logged-out clicks are counted,
 * not billed); the `servableCampaignWhere` CAS is the no-overspend guard.
 */
async function billValidClick(
  ad: AdRow,
  userId: string | null,
  eventId: string,
  country: string
): Promise<boolean> {
  if (ad.status !== "ACTIVE" || !ad.campaignId) {
    await bumpAdDailyStat(ad.id, { clicks: 1 }, country);
    return false;
  }
  if (ad.campaign?.isHouse) {
    await prisma.ad.update({ where: { id: ad.id }, data: { clicks: { increment: 1 } } }).catch(() => null);
    await bumpAdDailyStat(ad.id, { clicks: 1, spendUsd: 0 }, country);
    return false;
  }
  if (!userId || !(await clicksAreBillable(ad.placementId, ad.campaignId))) {
    if (userId) {
      await prisma.ad.update({ where: { id: ad.id }, data: { clicks: { increment: 1 } } }).catch(() => null);
    }
    await bumpAdDailyStat(ad.id, { clicks: 1, spendUsd: 0 }, country);
    return false;
  }

  const cost = await getPlacementClickCost(ad.placement?.name);
  const billed = await prisma.adCampaign.updateMany({
    where: { id: ad.campaignId, ...servableCampaignWhere(cost, new Date(), false) },
    data: { budget: { decrement: cost }, spentTotal: { increment: cost } },
  });
  const ok = billed.count > 0;
  if (ok) {
    await prisma.ad.update({ where: { id: ad.id }, data: { clicks: { increment: 1 } } }).catch(() => null);
    await prisma.adEvent
      .update({ where: { id: eventId }, data: { billed: true, costUsd: cost } })
      .catch(() => null);
  }
  await bumpAdDailyStat(ad.id, { clicks: 1, spendUsd: ok ? cost : 0 }, country);
  if (!ok) {
    // Out of budget — pause so it drops out of rotation (only when the budget
    // is what failed; see the note in the old recordClick history).
    await prisma.adCampaign
      .updateMany({
        where: { id: ad.campaignId, status: "ACTIVE", budget: { lt: cost } },
        data: { status: "PAUSED" },
      })
      .catch(() => {});
  }
  return ok;
}

/* ── Rollup + retention (scheduler job `ad-measure-rollup`) ────────────────── */

type Fold = {
  views: number;
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
  spendUsd: number;
  invalidReasons: Record<string, number>;
};

const emptyFold = (): Fold => ({
  views: 0,
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
  spendUsd: 0,
  invalidReasons: {},
});

/**
 * Recompute one UTC day's event columns from the raw events. Idempotent:
 * columns are SET, not incremented, so a re-run or an overlapping run cannot
 * double anything. `served` (buffered at delivery) is left untouched.
 */
export async function recomputeMeasureDay(day: Date): Promise<number> {
  const start = new Date(day);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  const rows = (await prisma.adEvent.groupBy({
    by: ["adId", "placement", "network", "kind", "valid", "internal", "reason"],
    where: { createdAt: { gte: start, lt: end } },
    _count: { _all: true },
    _sum: { costUsd: true },
  })) as unknown as Array<{
    adId: string;
    placement: string;
    network: string;
    kind: string;
    valid: boolean;
    internal: boolean;
    reason: string | null;
    _count: { _all: number };
    _sum: { costUsd: unknown };
  }>;

  const folds = new Map<string, Fold>();
  for (const r of rows) {
    const key = `${r.adId}\u0000${r.placement}\u0000${r.network}`;
    const f = folds.get(key) ?? emptyFold();
    const n = r._count._all;
    const real = r.valid && !r.internal;
    if (!r.valid) f.invalidReasons[r.reason ?? "unknown"] = (f.invalidReasons[r.reason ?? "unknown"] ?? 0) + n;
    switch (r.kind) {
      case "VIEW":
        f.views += n;
        if (real) f.validViews += n;
        else if (r.valid) f.internalViews += n;
        else f.invalidViews += n;
        break;
      case "CLICK":
        if (real) f.validClicks += n;
        else if (r.valid) f.internalClicks += n;
        else f.invalidClicks += n;
        if (real) f.spendUsd += Number(r._sum.costUsd ?? 0);
        break;
      case "EST_CLICK":
        if (real) f.estClicks += n;
        else if (!r.valid) f.invalidEstClicks += n;
        break;
      case "SCRIPT_EXEC":
        if (real) f.scriptExecs += n;
        else if (!r.valid) f.invalidScriptExecs += n;
        break;
    }
    folds.set(key, f);
  }

  const ops = [...folds.entries()].map(([key, f]) => {
    const [adId, placement, network] = key.split("\u0000") as [string, string, string];
    const data = { ...f, spendUsd: new Prisma.Decimal(f.spendUsd.toFixed(6)), invalidReasons: f.invalidReasons };
    return prisma.adMeasureDaily.upsert({
      where: { adId_placement_network_date: { adId, placement, network, date: start } },
      create: { adId, placement, network, date: start, ...data },
      update: data,
    });
  });
  // Small batches: Accelerate rejects a transaction over 15s.
  for (let i = 0; i < ops.length; i += 25) {
    await prisma.$transaction(ops.slice(i, i + 25));
  }
  return ops.length;
}

/**
 * Make one finished day's report impressions EXACT.
 *
 * `Ad.impressions`, `AdDailyStat` and `AdCountryDailyStat` are fed by an
 * in-memory buffer (ad-counters.ts) that is lost when a serverless instance is
 * recycled before it flushes — so the reports every screen reads ran a little
 * short. The raw `AdEvent` rows are complete: set each ad's day (and each
 * country row) to the count of valid, non-staff VIEW events, and move the
 * lifetime `Ad.impressions` by the same difference.
 *
 * Only a finished day: a late buffer flush lands on the flush day's bucket, so
 * the day before is final once reconciled. Idempotent — a second run finds no
 * difference.
 */
export async function reconcileImpressionsDay(day: Date): Promise<number> {
  const start = new Date(day);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  const events = (await prisma.adEvent.groupBy({
    by: ["adId", "country"],
    where: { kind: "VIEW", valid: true, internal: false, createdAt: { gte: start, lt: end } },
    _count: { _all: true },
  })) as unknown as Array<{ adId: string; country: string | null; _count: { _all: number } }>;

  const [stats, countryStats] = await Promise.all([
    prisma.adDailyStat.findMany({ where: { date: start }, select: { adId: true, impressions: true } }),
    prisma.adCountryDailyStat.findMany({ where: { date: start }, select: { adId: true, country: true, impressions: true } }),
  ]);
  const want = new Map<string, number>();
  const wantCountry = new Map<string, number>();
  for (const e of events) {
    want.set(e.adId, (want.get(e.adId) ?? 0) + e._count._all);
    const c = `${e.adId}|${e.country || UNKNOWN_COUNTRY}`;
    wantCountry.set(c, (wantCountry.get(c) ?? 0) + e._count._all);
  }
  const have = new Map(stats.map((r) => [r.adId, r.impressions]));
  const haveCountry = new Map(countryStats.map((r) => [`${r.adId}|${r.country}`, r.impressions]));
  // Ads that still exist (the counters have an FK; a deleted ad's events stay raw).
  const adIds = [...new Set([...want.keys(), ...have.keys()])];
  const alive = new Set(
    (await prisma.ad.findMany({ where: { id: { in: adIds } }, select: { id: true } })).map((a) => a.id)
  );

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const adId of adIds) {
    if (!alive.has(adId)) continue;
    const n = want.get(adId) ?? 0;
    const delta = n - (have.get(adId) ?? 0);
    if (delta === 0) continue;
    ops.push(
      prisma.adDailyStat.upsert({
        where: { adId_date: { adId, date: start } },
        create: { adId, date: start, impressions: n },
        update: { impressions: n },
      }),
      prisma.ad.update({ where: { id: adId }, data: { impressions: { increment: delta } } })
    );
  }
  for (const key of new Set([...wantCountry.keys(), ...haveCountry.keys()])) {
    const [adId, country] = key.split("|") as [string, string];
    if (!alive.has(adId)) continue;
    const n = wantCountry.get(key) ?? 0;
    if (n === (haveCountry.get(key) ?? 0)) continue;
    ops.push(
      prisma.adCountryDailyStat.upsert({
        where: { adId_country_date: { adId, country, date: start } },
        create: { adId, country, date: start, impressions: n },
        update: { impressions: n },
      })
    );
  }
  // Small batches: Accelerate rejects a transaction over 15s.
  for (let i = 0; i < ops.length; i += 25) {
    await prisma.$transaction(ops.slice(i, i + 25));
  }
  return ops.length;
}

/** Admin → Ads: correct report impressions from raw events (default on). */
export const EXACT_IMPRESSIONS_KEY = "ads.exact_impressions";

export async function runAdMeasureRollup(): Promise<{ rows: number; pruned: number; reconciled: number }> {
  const today = todayUtc();
  const yesterday = new Date(today.getTime() - 86_400_000);
  // Yesterday too: events that landed just before midnight, and a run that
  // was missed across the boundary.
  const rows = (await recomputeMeasureDay(yesterday)) + (await recomputeMeasureDay(today));

  // Yesterday is final once an hour of today has passed (buffers flush within
  // minutes, and a late flush lands on today's bucket anyway).
  let reconciled = 0;
  const exact = (await getSetting<boolean>(EXACT_IMPRESSIONS_KEY, true)) !== false;
  if (exact && Date.now() - today.getTime() >= 3_600_000) {
    reconciled = await reconcileImpressionsDay(yesterday);
  }

  const { rawRetentionDays } = await getIvtSettings();
  const cutoff = new Date(Date.now() - rawRetentionDays * 86_400_000);
  let pruned = 0;
  for (let i = 0; i < 10; i++) {
    const ids = await prisma.adEvent.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: 5000,
    });
    if (ids.length === 0) break;
    const r = await prisma.adEvent.deleteMany({ where: { id: { in: ids.map((x) => x.id) } } });
    pruned += r.count;
    if (ids.length < 5000) break;
  }
  return { rows, pruned, reconciled };
}

/**
 * First UTC day with measured events — everything before it in the legacy
 * counters was counted at SERVE time ("before real measurement"). Derived from
 * the data, so it is the real deploy day rather than a guess.
 */
export async function realMeasurementSince(): Promise<string | null> {
  const first = await prisma.adMeasureDaily
    .findFirst({ orderBy: { date: "asc" }, select: { date: true }, cacheStrategy: { ttl: 300, swr: 600 } })
    .catch(() => null);
  return first ? first.date.toISOString().slice(0, 10) : null;
}
