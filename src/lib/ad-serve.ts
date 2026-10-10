import { Prisma } from "@/generated/prisma/client";
import { currentDevice } from "@/lib/device-current";
import { effectiveCountry, isCountryIpOnly } from "@/lib/effective-country";
import { syncCountryMode } from "@/lib/country-mode";
import { prisma } from "@/lib/prisma";
import { getEffectivePackage } from "@/lib/packages";
import { getActiveBooking, getPlacementClickCost } from "@/lib/ad-rate-card";
import {
  claimInterstitialSlot,
  isFrequencyCapped,
} from "@/lib/ad-frequency";
import { matchesTargeting, type TargetableUser } from "@/lib/ad-targeting";
import { getSetting } from "@/lib/system-settings";
import { bufferServed, bufferServeOutcome } from "@/lib/ad-counters";
import { isBotRequest } from "@/lib/bot-detect";
import { resolveCountryCode } from "@/lib/country-codes";
import { creativeUrl, isFirstPartyAdType } from "@/lib/ad-proxy";
import {
  getNetworkGlobals,
  resolveNetworkSlot,
  type NetworkSlotConfig,
} from "@/lib/ad-network";
import type { FeedAd } from "@/components/user/feed/feed-ad-card";
import { signAdServeToken } from "@/lib/ad-serve-token";
import { currentAdViewer, type AdViewer } from "@/lib/ad-viewer";
import { adMayServeIn, PAGE_SCRIPT_PLACEMENT } from "@/lib/ad-placements";
import { getNetworkSettings } from "@/lib/ad-networks/settings";
import { adFrameUrl } from "@/lib/ad-networks/frame";
import { getAdNetwork } from "@/lib/ad-networks/registry";
import { parseSnippetScripts, type SnippetScript } from "@/lib/ad-networks/snippet";

/** Shaped banner/interstitial ad — identical to the `/api/ads/serve` payload. */
export interface ServedAd {
  id: string;
  type: string;
  imageUrl?: string;
  videoUrl?: string;
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  html?: string;
  sponsor?: string;
  size?: string;
  width?: number;
  height?: number;
  impressionPixel?: string;
  clickTracker?: string;
  /** Admin-granted per-ad escape hatch for network creatives (see SandboxedAdFrame). */
  allowSameOrigin?: boolean;
  /** Present only for ADSENSE / GAM — what the client needs to build a real slot. */
  network?: NetworkSlotConfig;
  /** HTML ads: registry network id (null/absent = own / direct-sold HTML). */
  networkId?: string;
  /**
   * HTML ads, when AD_FRAME_ORIGIN is configured: the frame document on the
   * separate ad origin. Absent → the client renders `html` in an opaque srcDoc.
   */
  frameUrl?: string;
  /** Optional small-screen (<728px) variant of an HTML ad. */
  mobileHtml?: string;
  mobileFrameUrl?: string;
  mobileWidth?: number;
  mobileHeight?: number;
  /**
   * Serve token. Nothing about this delivery is counted unless the browser
   * returns it: a viewable-impression beacon, or the click redirect
   * (src/lib/ad-measure.ts).
   */
  st?: string;
}

/** Network label the measurement layer records — same as `adNetworkLabel` client-side. */
export function adNetworkOf(ad: { type?: string | null; networkId?: string | null }): string {
  if (ad.type === "ADSENSE") return "adsense";
  if (ad.type === "GAM") return "gam";
  if (ad.type === "HTML" && ad.networkId) return ad.networkId;
  return "own";
}

/**
 * Stamp one delivered ad: sign its serve token and count it as SERVED
 * (buffered). Served is a delivery, not an impression — see ad-measure.ts.
 * A crawler's delivery is not counted as served either.
 */
function stampDelivery(
  viewer: AdViewer,
  bot: boolean,
  adId: string,
  placement: string,
  network: string
): string | undefined {
  if (!bot) bufferServed(adId, placement, network);
  return signAdServeToken({ adId, placement, network, viewerKey: viewer.viewerKey });
}

export interface ServeResult {
  poolSize: number;
  rotateMs: number;
  interstitialSeconds: number;
  /** Auto-close after this many seconds; null = until the viewer closes it. */
  showSeconds?: number | null;
  ad: ServedAd | null;
  /** True when this serve already counted the impression, so the client must
   *  NOT also fire a view beacon (that double-counted every interstitial). */
  countedServerSide?: boolean;
}

const EMPTY: ServeResult = {
  poolSize: 0,
  rotateMs: 0,
  interstitialSeconds: 5,
  ad: null,
};

/**
 * Identical to EMPTY on the wire, but tells the wrapper below that no ad was
 * WITHHELD rather than missing — an ad-free plan, or a frequency cap.
 *
 * The distinction is the whole point of fill-rate tracking. Counting a
 * deliberate suppression as a no-fill would make every space look starved for
 * reasons that have nothing to do with inventory, and the number would then be
 * useless for the one decision it exists to inform: which spaces are worth
 * keeping. Referential identity is the marker, so nothing leaks to the client.
 */
const SUPPRESSED: ServeResult = {
  poolSize: 0,
  rotateMs: 0,
  interstitialSeconds: 5,
  ad: null,
};

/** Viewer attributes targeting can filter on — must cover every AdTargeting geo
 *  dimension or a rule silently matches nobody. */
/**
 * The viewer's country, as the ISO2 code the targeting matcher compares against.
 *
 * `matchesTargeting()` lowercases `user.country` and looks for it in the
 * campaign's list of ISO2 codes. That is an exact string comparison, so an
 * account holding the display name "Bangladesh" — three of them do, from a
 * free-text admin field since fixed — matches NO Bangladesh campaign and is
 * silently dropped from every geo-targeted buy. Nobody sees an error; the
 * advertiser just reaches fewer people than they paid for.
 *
 * Resolving here, once per serve, rather than inside the matcher, is deliberate:
 * the matcher runs per AD per serve and must stay synchronous and allocation-free.
 * Unresolvable values are left as they are rather than blanked — an unknown
 * country should fail to match a targeted ad, not become "everyone".
 */
async function normalizeViewerCountry(
  raw: string | null | undefined
): Promise<string | null | undefined> {
  if (!raw) return raw;
  return (await resolveCountryCode(raw)) ?? raw;
}

const VIEWER_SELECT = {
  country: true,
  region: true,
  division: true,
  district: true,
  subDistrict: true,
  // IP country — the fallback when the profile has none (lib/effective-country).
  lastCountry: true,
  signupCountry: true,
  postalCode: true,
  city: true,
  gender: true,
  level: true,
  dateOfBirth: true,
  kycStatus: true,
  isBlueVerified: true,
  tags: true,
  language: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

/**
 * The campaign an ad must belong to in order to serve. Applied on EVERY path —
 * interstitials used to skip it entirely, which let ads run on a paused, ended,
 * out-of-window or $0 campaign (i.e. for free). House inventory is exempt from
 * the budget floor only, never from the rest.
 */
export function servableCampaignWhere(
  cost: number,
  now: Date,
  houseOnly: boolean
): Prisma.AdCampaignWhereInput {
  return {
    status: "ACTIVE",
    ...(houseOnly ? { isHouse: true } : {}),
    AND: [
      { OR: [{ startAt: null }, { startAt: { lte: now } }] },
      { OR: [{ endAt: null }, { endAt: { gte: now } }] },
      { OR: [{ isHouse: true }, { budget: { gte: cost } }] },
      // A suspended/banned advertiser's ads must stop, not keep running on a
      // pre-funded budget.
      { OR: [{ advertiserId: null }, { advertiser: { is: { status: "ACTIVE" } } }] },
    ],
  };
}

/**
 * Select an ad for a placement: ad-free gate → placement lookup → active/funded/
 * in-flight ads → audience targeting → weighted pick → impression bump. Shared by
 * the `/api/ads/serve` route AND server components that SSR-inject the first ad
 * (so a blocked client fetch can't hide it). Returns `{ ad: null }` when nothing
 * is eligible (incl. ad-free viewers). `countImpression` defaults true.
 */
async function serveAdInner(opts: {
  placement: string;
  userId?: string | null;
  exclude?: Iterable<string>;
  countImpression?: boolean;
  /** Admin preview: serve any ACTIVE ad on the placement (skip ad-free /
   *  targeting / budget / flight gates) and never count an impression. */
  preview?: boolean;
  /**
   * Skip AdSense/GAM and serve own/direct inventory only.
   *
   * Used when a Google slot comes back unfilled: rather than leave a hole where
   * an ad should be, the client re-requests with this and gets a house or
   * direct-sold creative. While AdSense approval is still pending this is what
   * makes the network spaces earn anything at all.
   */
  ownInventoryOnly?: boolean;
  /**
   * This request is a ROTATION of a slot that is already showing something.
   * Google inventory is never served into a rotation: re-requesting an AdSense
   * or Ad Manager unit on a timer is ad refresh, which Google prohibits without
   * an approved refresh setup — so Google ads are excluded from rotation pools.
   */
  rotation?: boolean;
}): Promise<ServeResult> {
  const { placement, userId, preview } = opts;
  const exclude = new Set(opts.exclude ?? []);

  // Page scripts are not a visual slot; they have their own serve path
  // (`servePageScripts`). A weighted single pick here would be meaningless.
  if (placement === PAGE_SCRIPT_PLACEMENT) return EMPTY;

  // Interstitial placements (REWARD/VIDEO/GAME_INTERSTITIAL) are shown before a
  // reward, so an ad-free plan still sees them — but only HOUSE inventory. They
  // are NOT exempt from the campaign gate: that exemption was letting paid ads
  // run on dead or unfunded campaigns.
  const interstitial = placement.endsWith("_INTERSTITIAL");

  // Starts as an EMPTY viewer, not null.
  //
  // Targeting was applied only when `viewer` was non-null, and `viewer` stayed
  // null for every anonymous request — so a logged-out visitor was served EVERY
  // ad on the placement regardless of country, age, gender, level or KYC rules,
  // and `bufferImpression` counted it. An advertiser paying for Bangladesh was
  // billed for impressions from anywhere, ad-free plans were ignored, and every
  // live creative plus its `targetUrl` was enumerable without an account.
  // `serveFeedAds` below already does it this way and always filters; this is
  // that behaviour, applied to the banner path too. `matchesTargeting({}, {})`
  // correctly passes an untargeted ad and rejects a targeted one.
  // The space and its click price depend on the PLACEMENT only — not on who is
  // looking — so they are started here and awaited after the viewer block
  // instead of queued behind it.
  //
  // This path runs on 41% of all requests in the app (every rotating ad slot,
  // measured over a real session), and it was six Accelerate round-trip layers
  // deep: viewer → country → placement → price → creatives → booking. Both of
  // these are cached reads with no side effects, so starting them early changes
  // nothing about what is served — it only stops them waiting their turn.
  const placementRowPromise = prisma.adPlacement.findFirst({
    where: { name: placement, isActive: true },
    cacheStrategy: { ttl: 30, swr: 60 },
  });
  // Per-space click price, falling back to the global one. This is the budget
  // FLOOR here, not a charge — an ad may only serve if its campaign can afford
  // a click on this particular space.
  const costPromise = getPlacementClickCost(placement);
  // An early `return` below leaves these unawaited; attach a no-op catch so a
  // failed read can never surface as an unhandled rejection.
  placementRowPromise.catch(() => {});
  costPromise.catch(() => {});

  // The device in use now, for device-targeted ads (undefined outside a request).
  let viewer: TargetableUser = { device: await currentDevice() };
  let houseOnly = false;
  if (userId && !preview) {
    const [pkg, u] = await Promise.all([
      getEffectivePackage(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: VIEWER_SELECT,
        // Targeting attributes (country/gender/level…) change rarely.
        cacheStrategy: { ttl: 60, swr: 300 },
      }),
    ]);
    if (pkg?.adFree && !interstitial) return SUPPRESSED; // Watch & Earn is unaffected
    houseOnly = !!pkg?.adFree;
    viewer = {
      device: viewer.device, ...(u ?? {}), packageSlug: pkg?.slug ?? null };
    // Profile country, or the IP country when the profile has none.
    await syncCountryMode();
    viewer.country = isCountryIpOnly()
      ? effectiveCountry(u)
      : (await normalizeViewerCountry(u?.country)) || effectiveCountry(u) || null;
  }

  // Full-screen frequency cap. Checked before the placement lookup so a capped
  // user costs one cheap limiter query rather than the whole serve path.
  //
  // Returning EMPTY is the entire mechanism: `AdInterstitialOverlay` calls
  // `onDone()` immediately when the serve has no ad, so a capped user's reward
  // is neither delayed nor blocked — they simply aren't shown one. See
  // ad-frequency.ts for why the cap has to exist at all.
  //
  // Skipped for previews (an admin looking at a space must always see it) and
  // for anonymous viewers (there is no per-user budget to spend).
  if (!preview && userId && isFrequencyCapped(placement)) {
    const slot = await claimInterstitialSlot(userId, placement);
    if (!slot.allowed) return SUPPRESSED;
  }

  const [placementRow, cost] = await Promise.all([
    placementRowPromise,
    costPromise,
  ]);
  if (!placementRow) return EMPTY;

  const now = new Date();
  // The eligible pool is IDENTICAL for every viewer of a placement, so it is a
  // textbook shared read: cache it. Targeting and the weighted pick still run
  // per request in JS below, so rotation variety is unchanged. `take` also caps
  // the response so a placement with many ads can't hit Accelerate's payload
  // limit (P6009), which is explicitly non-retryable.
  // The creative pool and the space's booking both key off `placementRow.id`
  // and nothing else, so they go together rather than one behind the other.
  // `getActiveBooking` is a memoised read with no side effects; issuing it for a
  // space that turns out to have no targeted ads costs nothing and saves a
  // round-trip on every space that does.
  const [allAds, booking] = await Promise.all([
    prisma.ad.findMany({
      where: {
        placementId: placementRow.id,
        status: "ACTIVE",
        // Admin preview (ads.view-gated, never counts an impression) is the only
        // path allowed to look past the campaign gate, so an admin can still see
        // what a space renders while a campaign is paused.
        ...(preview
          ? {}
          : { campaign: servableCampaignWhere(cost, now, houseOnly) }),
        ...(opts.ownInventoryOnly || opts.rotation
          ? { type: { notIn: ["ADSENSE", "GAM"] } }
          : {}),
      },
      include: { campaign: { select: { title: true } } },
      take: 50,
      ...(preview ? {} : { cacheStrategy: { ttl: 30, swr: 120 } }),
    }),
    preview ? Promise.resolve(null) : getActiveBooking(placementRow.id, now),
  ]);

  // The space's policy, enforced at SERVE time and not only at save time.
  //
  // `checkAdFitsPlacement` refuses Google creatives on incentivised spaces when
  // an ad is saved, but rows saved before a space was marked incentivised —
  // and HTML snippets from a network the owner has not cleared for paid pages
  // — were still served. This is the gate that reaches every existing row.
  const networkSettings = await getNetworkSettings().catch(() => null);
  const allowed = allAds.filter((a) => adMayServeIn(placement, a, networkSettings));

  // Always filter. See the note on `viewer` above.
  const targeted = allowed.filter((a) => matchesTargeting(a.targeting, viewer));
  if (targeted.length === 0) return EMPTY;

  // A space rented outright belongs to its buyer for the period.
  //
  // The guard is the important half: if the booked campaign has nothing
  // servable right now — every creative paused, rejected, or filtered out by
  // targeting — the space falls through to the normal pool rather than going
  // dark. An empty space is the failure mode Phase 2 existed to kill, and a
  // sponsor who paid for a month would not thank anyone for a blank rectangle.
  // Previews skip this: an admin looking at a space must see what it holds.
  let pool = targeted;
  if (!preview) {
    if (booking?.exclusive) {
      const booked = targeted.filter((a) => a.campaignId === booking.campaignId);
      if (booked.length > 0) pool = booked;
    }
  }

  const fresh = pool.filter((a) => !exclude.has(a.id));
  const ads = fresh.length > 0 ? fresh : pool;

  // Weighted pick.
  const totalWeight = ads.reduce((sum, a) => sum + (a.weight ?? 10), 0);
  let pick = Math.random() * totalWeight;
  let chosen = ads[0];
  for (const ad of ads) {
    pick -= ad.weight ?? 10;
    if (pick <= 0) {
      chosen = ad;
      break;
    }
  }

  const rotateSecondsRaw =
    placementRow.rotationSeconds ??
    (await getSetting<number>("ads.rotation_seconds", 12));
  const rotateSeconds = Math.min(60, Math.max(5, Number(rotateSecondsRaw) || 12));
  // Skip time: the ad's own setting wins, then the space's, then 5s — so one
  // space can mix 5s, 10s and 15s ads.
  const interstitialSeconds =
    chosen.skipAfterSeconds != null
      ? Math.min(60, Math.max(0, chosen.skipAfterSeconds))
      : Math.min(60, Math.max(3, placementRow.interstitialSeconds ?? 5));
  // Auto-close time, never earlier than the skip time. Null = until closed.
  const showSeconds =
    chosen.showSeconds != null && chosen.showSeconds > 0
      ? Math.min(300, Math.max(interstitialSeconds, chosen.showSeconds))
      : null;

  const proxy = isFirstPartyAdType(chosen.type);
  // Network types (ADSENSE/GAM) ship their SLOT CONFIG, not markup.
  //
  // They used to be composed into a self-contained document here and rendered in
  // a sandboxed iframe, so every slot loaded its own copy of Google's script.
  // The client now renders a real in-page `<ins>` / GPT slot from this config,
  // against the single page-level tag in the root layout — the only arrangement
  // Google supports, and the only one that fills properly.
  const html = chosen.htmlContent ?? undefined;
  const mobileHtml = chosen.type === "HTML" ? chosen.mobileHtmlContent ?? undefined : undefined;
  let network: NetworkSlotConfig | undefined;
  if (chosen.type === "ADSENSE" || chosen.type === "GAM") {
    network =
      resolveNetworkSlot(chosen, await getNetworkGlobals(), placement) ??
      undefined;
    // Incomplete network setup — the normal state before an account exists.
    // Serving nothing is right: it keeps every Google reference off the page.
    if (!network) return EMPTY;
  }

  // Impressions are NOT counted here any more. Until 2026-10-06 this buffered
  // an impression at delivery, so crawlers, unfilled Google units and banners
  // nobody scrolled to were all "impressions". A delivery is now counted as
  // SERVED in `serveAd` below, and an impression only when the browser proves
  // the ad was viewable (src/lib/ad-measure.ts).

  return {
    poolSize: ads.length,
    rotateMs: rotateSeconds * 1000,
    interstitialSeconds,
    showSeconds,
    // Never counted at serve any more — the client's viewability tracker is
    // the only thing that records an impression.
    countedServerSide: false,
    ad: {
      id: chosen.id,
      type: chosen.type,
      imageUrl: creativeUrl(chosen.id, "img", chosen.contentUrl, proxy, chosen.updatedAt),
      videoUrl: creativeUrl(chosen.id, "video", chosen.videoUrl, proxy, chosen.updatedAt),
      title: chosen.campaign.title,
      body: undefined,
      ctaLabel: "Learn More",
      ctaUrl: chosen.targetUrl ?? undefined,
      html,
      network,
      networkId: chosen.type === "HTML" ? chosen.networkId ?? undefined : undefined,
      frameUrl: html ? adFrameUrl(chosen.id, "d", chosen.updatedAt) : undefined,
      mobileHtml,
      mobileFrameUrl: mobileHtml ? adFrameUrl(chosen.id, "m", chosen.updatedAt) : undefined,
      mobileWidth: mobileHtml ? chosen.mobileWidth ?? undefined : undefined,
      mobileHeight: mobileHtml ? chosen.mobileHeight ?? undefined : undefined,
      sponsor: undefined,
      size: chosen.size ?? undefined,
      width: chosen.width ?? undefined,
      height: chosen.height ?? undefined,
      impressionPixel: chosen.impressionPixel ?? undefined,
      clickTracker: chosen.clickTracker ?? undefined,
      allowSameOrigin: chosen.allowSameOrigin || undefined,
    },
  };
}

/**
 * Select an ad for a placement, and record whether the request was filled.
 *
 * The recording is the reason this wrapper exists. `serveAdInner` has eight paths
 * that return no ad, and instrumenting each of them would guarantee that the next
 * early return added silently stops counting — the denominator would drift away
 * from the numerator and nobody would notice, because the number would still look
 * plausible. Counting once, here, at the single boundary, cannot drift.
 *
 * Two outcomes are deliberately NOT counted:
 *
 *  - **Suppression** (ad-free plan, frequency cap). Nothing was missing; an ad was
 *    withheld on purpose. Counting it would make every space look starved for
 *    reasons that have nothing to do with inventory.
 *  - **Previews.** An admin looking at a space is not a viewer.
 *
 * Never throws and never delays the serve: a failure to record a diagnostic must
 * not cost a real impression.
 */
export async function serveAd(opts: {
  placement: string;
  userId?: string | null;
  exclude?: Iterable<string>;
  countImpression?: boolean;
  preview?: boolean;
  ownInventoryOnly?: boolean;
  rotation?: boolean;
}): Promise<ServeResult> {
  const result = await serveAdInner(opts);
  if (!opts.preview && result !== SUPPRESSED) {
    // Fire-and-forget. The placement id is resolved from the same cached read
    // `serveAdInner` just made, so this is a cache hit rather than a query.
    void recordServeOutcome(opts.placement, !!result.ad);
  }
  // Stamp the delivery — signed-in AND anonymous viewers. The token is the
  // only thing that lets a view or a click on this ad be counted.
  if (!opts.preview && result.ad) {
    const [viewer, bot] = await Promise.all([
      currentAdViewer(opts.userId),
      isBotRequest(),
    ]);
    const st = stampDelivery(viewer, bot, result.ad.id, opts.placement, adNetworkOf(result.ad));
    if (st) return { ...result, ad: { ...result.ad, st } };
  }
  return result;
}

async function recordServeOutcome(placement: string, filled: boolean) {
  try {
    const row = await prisma.adPlacement.findFirst({
      where: { name: placement, isActive: true },
      select: { id: true },
      cacheStrategy: { ttl: 30, swr: 60 },
    });
    // An unknown or inactive space has no row to attribute the request to. That
    // is a configuration problem, not a fill problem, and it is already visible
    // in the placement list.
    if (row) bufferServeOutcome(row.id, filled);
  } catch {
    /* a diagnostic must never break ad serving */
  }
}

/** Order items by a weighted-random draw (higher weight → earlier, on average). */
function weightedShuffle<T extends { weight: number | null }>(items: T[]): T[] {
  return [...items]
    .map((item) => ({
      item,
      key: Math.pow(Math.random(), 1 / Math.max(item.weight ?? 10, 1)),
    }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item);
}

/**
 * Select up to `count` NATIVE in-feed ads for the viewer, shaped like a post and
 * with first-party-proxied brand creatives. Shared by `/api/ads/feed` (client
 * rotation) and the feed page's SSR injection. Returns `[]` for ad-free viewers
 * or when nothing is eligible.
 */
export async function serveFeedAds(opts: {
  userId?: string | null;
  count: number;
  exclude?: Iterable<string>;
}): Promise<(FeedAd & { st?: string })[]> {
  const { userId } = opts;
  const count = Math.min(Math.max(opts.count, 1), 20);
  const exclude = new Set(opts.exclude ?? []);

  // The device in use now, for device-targeted ads (undefined outside a request).
  let viewer: TargetableUser = { device: await currentDevice() };
  if (userId) {
    const [pkg, u] = await Promise.all([
      getEffectivePackage(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: VIEWER_SELECT,
        // Targeting attributes (country/gender/level…) change rarely.
        cacheStrategy: { ttl: 60, swr: 300 },
      }),
    ]);
    if (pkg?.adFree) return [];
    viewer = {
      device: viewer.device, ...(u ?? {}), packageSlug: pkg?.slug ?? null };
    // Profile country, or the IP country when the profile has none.
    await syncCountryMode();
    viewer.country = isCountryIpOnly()
      ? effectiveCountry(u)
      : (await normalizeViewerCountry(u?.country)) || effectiveCountry(u) || null;
  }

  const placement = await prisma.adPlacement.findFirst({
    where: { name: "IN_FEED", isActive: true },
    select: { id: true },
    cacheStrategy: { ttl: 30, swr: 60 },
  });
  // No row to attribute the request to — a configuration problem, not a fill
  // problem, exactly as `recordServeOutcome` treats it for the other spaces.
  if (!placement) return [];

  // IN_FEED has its own rate on the card, like every other space.
  const cost = await getPlacementClickCost("IN_FEED");
  const now = new Date();
  const ads = await prisma.ad.findMany({
    where: {
      placementId: placement.id,
      status: "ACTIVE",
      format: "NATIVE",
      campaign: servableCampaignWhere(cost, now, false),
    },
    select: {
      id: true,
      weight: true,
      headline: true,
      brandName: true,
      brandLogo: true,
      ctaLabel: true,
      contentUrl: true,
      videoUrl: true,
      targetUrl: true,
      targeting: true,
      promotedPostId: true,
      updatedAt: true,
    },
    // The pool is identical for every viewer — the same shared read the banner
    // path caches. `take` keeps the payload under Accelerate's limit (P6009).
    take: 50,
    cacheStrategy: { ttl: 30, swr: 120 },
  });

  const eligible = ads.filter((a) => matchesTargeting(a.targeting, viewer));
  const unseen = eligible.filter((a) => !exclude.has(a.id));
  const pool = unseen.length > 0 ? unseen : eligible;
  const picked = weightedShuffle(pool).slice(0, count);

  // Resolve promoted posts (author + content) in one batch.
  const postIds = picked
    .map((a) => a.promotedPostId)
    .filter((x): x is string => !!x);
  const posts = postIds.length
    ? await prisma.post.findMany({
        where: { id: { in: postIds } },
        select: {
          id: true,
          content: true,
          images: true,
          backgroundStyle: true,
          user: {
            select: {
              name: true,
              username: true,
              avatar: true,
              isBlueVerified: true,
              verifiedBadgeStyle: true,
            },
          },
        },
      })
    : [];
  const postMap = new Map(posts.map((p) => [p.id, p]));

  const out = picked
    .map((a): FeedAd | null => {
      if (a.promotedPostId) {
        const p = postMap.get(a.promotedPostId);
        if (!p) return null;
        return {
          adId: a.id,
          kind: "post",
          author: {
            name: p.user?.name ?? p.user?.username ?? "User",
            username: p.user?.username ?? null,
            avatar: p.user?.avatar ?? null,
            isBlueVerified: p.user?.isBlueVerified ?? false,
            verifiedBadgeStyle: p.user?.verifiedBadgeStyle ?? null,
          },
          content: p.content ?? "",
          images: p.images ?? [],
          videoUrl: null,
          backgroundStyle: p.backgroundStyle ?? null,
          ctaLabel: a.ctaLabel || "Learn More",
          targetUrl: a.targetUrl ?? null,
        };
      }
      // Custom brand creative — first-party-proxied image/logo/video.
      return {
        adId: a.id,
        kind: "brand",
        author: {
          name: a.brandName || "Sponsored",
          username: null,
          avatar: creativeUrl(a.id, "logo", a.brandLogo, true, a.updatedAt) ?? null,
          isBlueVerified: false,
          verifiedBadgeStyle: null,
        },
        content: a.headline ?? "",
        images: [creativeUrl(a.id, "img", a.contentUrl, true, a.updatedAt)].filter(
          (u): u is string => !!u
        ),
        videoUrl: creativeUrl(a.id, "video", a.videoUrl, true, a.updatedAt) ?? null,
        backgroundStyle: null,
        ctaLabel: a.ctaLabel || "Learn More",
        targetUrl: a.targetUrl ?? null,
      };
    })
    .filter((x): x is FeedAd => x !== null);

  // ── Counting: the same basis as the other 24 spaces ──────────────────────
  //
  // IN_FEED used to count NOTHING here. Its entire impression figure came from
  // the client `kind:"view"` beacon, which is deduped per (ad, viewer, minute),
  // while every other space counts server-side at delivery with no dedup at all
  // — a banner on a 12-second rotation books five impressions a minute for one
  // viewer sitting still. Put side by side in the same report table, IN_FEED
  // therefore looked roughly an order of magnitude weaker than spaces it may
  // well outperform, for a reason that has nothing to do with performance. A
  // report that ranks the owner's inventory has to rank it on one ruler.
  //
  // The ruler chosen is DELIVERY, server-side, no dedup: it is what 24 of the 25
  // spaces already record (so the existing history stays comparable), it costs
  // no extra write on the hot path, and it does not depend on a client beacon
  // that an ad blocker can strip — which matters on an ad stack built
  // specifically to survive blockers.
  //
  // Stated plainly, because it is the cost of that choice: the feed client
  // prefetches a POOL and spaces it through the scroll, so a session abandoned
  // early leaves some delivered creatives unseen and counted. The banner path
  // has the mirror-image flaw (a rotation counts whether or not the viewer
  // looked). Neither is a viewability metric and neither is sold as one.
  //
  // The `kind:"view"` beacon no longer increments any counter (see
  // `recordImpression` in ad-events.ts), so this does not double-count.
  // Same bot rule as the single-ad path above — one test, both rulers, or the
  // feed and every other space would be measuring different audiences again.
  // Since 2026-10-06 nothing is counted as an impression here: each card is
  // stamped as SERVED below, and counted as an impression only when the
  // card's viewability beacon comes back (src/lib/ad-measure.ts).
  // Fill data, like every other placement. Without it a feed with no eligible
  // demand and a feed nobody opened were indistinguishable in the fill report —
  // IN_FEED was the one space in the list with no denominator at all.
  bufferServeOutcome(placement.id, out.length > 0);

  // Serve token per delivered ad — the only thing that makes a click on it
  // billable (see ad-serve-token).
  const [adViewer, bot] = await Promise.all([currentAdViewer(userId), isBotRequest()]);
  return out.map((a) => ({ ...a, st: stampDelivery(adViewer, bot, a.adId, "IN_FEED", "own") }));
}

/* ── Batch serve ─────────────────────────────────────────────────────────────
 * One request for every slot that mounted in the same tick.
 *
 * A page with an anchor, a top slot and a few under-post banners used to send
 * one `/api/spaces/panel` per slot, each repeating the viewer / placement /
 * pool reads. The client now coalesces them (ad-batch-client.ts) and this
 * serves the lot.
 *
 * Cross-slot exclusion: two instances of the SAME space (the under-post banner
 * is mounted once per post) are served one after another with every id already
 * chosen added to the exclusion list, so the same creative is not shown twice
 * on one screen while the pool has an alternative. Different spaces hold
 * different Ad rows, so they are served in parallel.
 */
export const MAX_BATCH = 12;

export async function serveAdBatch(opts: {
  placements: string[];
  userId?: string | null;
  exclude?: Iterable<string>;
}): Promise<ServeResult[]> {
  const list = opts.placements.slice(0, MAX_BATCH);
  const baseExclude = [...(opts.exclude ?? [])];
  const results: ServeResult[] = new Array(list.length);

  const groups = new Map<string, number[]>();
  list.forEach((p, i) => {
    const g = groups.get(p);
    if (g) g.push(i);
    else groups.set(p, [i]);
  });

  await Promise.all(
    [...groups.entries()].map(async ([placement, idxs]) => {
      const chosen: string[] = [];
      for (const i of idxs) {
        try {
          const r = await serveAd({
            placement,
            userId: opts.userId,
            exclude: [...baseExclude, ...chosen],
          });
          results[i] = r;
          if (r.ad) chosen.push(r.ad.id);
        } catch {
          results[i] = EMPTY;
        }
      }
    })
  );
  return results;
}

/* ── Page scripts ────────────────────────────────────────────────────────────
 * Site-wide network scripts (popunder, social bar, in-page push, vignette).
 * Every eligible ad is returned, not one weighted pick: each is a separate
 * network tag with its own frequency cap, enforced in the browser by
 * `PageScriptAds`. The client decides the route (never an incentivised path)
 * and consent; this decides who may see what.
 */
export interface PageScriptAd {
  id: string;
  networkId: string | null;
  scripts: SnippetScript[];
  /** Max injections per viewer per day (null = unlimited). */
  capPerDay: number | null;
  /** Minimum minutes between injections for one viewer (null = none). */
  minGapMinutes: number | null;
  /** Skip on pages that also load AdSense / Ad Manager (see registry). */
  conflictsWithGoogle: boolean;
  /** Serve token — returned in the "script executed" beacon. */
  st?: string;
}

export async function servePageScripts(opts: {
  userId?: string | null;
}): Promise<{ scripts: PageScriptAd[]; withGoogle: boolean }> {
  const none = { scripts: [] as PageScriptAd[], withGoogle: false };
  const { userId } = opts;

  // The device in use now, for device-targeted ads (undefined outside a request).
  let viewer: TargetableUser = { device: await currentDevice() };
  if (userId) {
    const [pkg, u] = await Promise.all([
      getEffectivePackage(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: VIEWER_SELECT,
        cacheStrategy: { ttl: 60, swr: 300 },
      }),
    ]);
    // An ad-free plan buys freedom from page-level ads above all.
    if (pkg?.adFree) return none;
    viewer = {
      device: viewer.device, ...(u ?? {}), packageSlug: pkg?.slug ?? null };
    await syncCountryMode();
    viewer.country = isCountryIpOnly()
      ? effectiveCountry(u)
      : (await normalizeViewerCountry(u?.country)) || effectiveCountry(u) || null;
  }

  const placement = await prisma.adPlacement.findFirst({
    where: { name: PAGE_SCRIPT_PLACEMENT, isActive: true },
    select: { id: true },
    cacheStrategy: { ttl: 30, swr: 60 },
  });
  if (!placement) return none;

  const [ads, settings] = await Promise.all([
    prisma.ad.findMany({
      where: {
        placementId: placement.id,
        status: "ACTIVE",
        type: "HTML",
        // No click is ever billed on a page script, so no budget floor.
        campaign: servableCampaignWhere(0, new Date(), false),
      },
      select: {
        id: true,
        type: true,
        networkId: true,
        htmlContent: true,
        targeting: true,
        freqCapPerDay: true,
        freqMinGapMinutes: true,
      },
      take: 20,
      cacheStrategy: { ttl: 30, swr: 120 },
    }),
    getNetworkSettings().catch(() => null),
  ]);

  const out: PageScriptAd[] = [];
  const [psViewer, psBot] = await Promise.all([currentAdViewer(userId), isBotRequest()]);
  for (const a of ads) {
    // Untagged page scripts count as "Custom / other" — still a third party.
    const netId = a.networkId || "custom";
    if (!settings?.networks[netId]?.enabled) continue;
    const def = getAdNetwork(netId);
    if (!def || def.google || !def.kinds.includes("PAGE_SCRIPT")) continue;
    if (!matchesTargeting(a.targeting, viewer)) continue;
    const scripts = parseSnippetScripts(a.htmlContent);
    if (scripts.length === 0) continue;
    out.push({
      id: a.id,
      networkId: a.networkId,
      scripts,
      capPerDay: a.freqCapPerDay ?? null,
      minGapMinutes: a.freqMinGapMinutes ?? null,
      conflictsWithGoogle: !!def.conflictsWithGoogle,
      st: stampDelivery(psViewer, psBot, a.id, PAGE_SCRIPT_PLACEMENT, a.networkId || "custom"),
    });
  }
  return { scripts: out, withGoogle: settings?.pageScriptsWithGoogle === true };
}
