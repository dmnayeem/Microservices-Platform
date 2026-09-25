/**
 * Promoting the platform's own marketplace listings and courses as ads.
 *
 * The ad system already reaches 36 placements across the app, and the house
 * campaign already exists to fill spaces that would otherwise earn nothing
 * (`lib/ad-demo.ts`). What was missing was a way to point that machinery at
 * something the platform actually sells. Marketing a listing meant an admin
 * downloading its image, re-uploading it as a creative, retyping the title and
 * pasting the URL — per item, per placement. Nobody does that for forty
 * products, so nothing was ever promoted.
 *
 * A promo here is an ordinary `Ad` in the house campaign. Deliberately so:
 * serving, frequency capping, the ad-blocker fallback, impression and click
 * counting and the admin reports all work on `Ad`, and a second kind of
 * "promotional thing" would have to reimplement every one of them and would
 * drift.
 *
 * Two consequences worth stating, because they are the design and not an
 * oversight:
 *
 *  - House ads are NEVER billed (`isHouse`), so promoting your own stock costs
 *    nothing and earns nothing. It competes for the same slots as paid
 *    inventory, which is why the weight below sits under it.
 *  - The creative is the item's own image and its live title and price, read at
 *    promote time. An item whose price changes later shows a stale figure until
 *    it is re-promoted, so `refreshPromos()` exists and the admin screen calls
 *    it.
 */
import { prisma } from "@/lib/prisma";
import { HOUSE_CAMPAIGN_TITLE } from "@/lib/ad-demo";
import { placementSizeKey } from "@/lib/ad-placements";
import { ensureDefaultPlacements } from "@/lib/ad-placements-server";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";

export type PromoKind = "LISTING" | "COURSE";

/**
 * Below paid inventory, above the house fallback.
 *
 * A promo is still house inventory: if an advertiser has paid for the slot,
 * their ad must win it. `ensureHouseFallback` seeds at weight 5, so promoting
 * real stock outranks a generic "upgrade your plan" filler while still losing
 * to anyone who paid.
 */
const PROMO_WEIGHT = 7;

/** The link a promo points at. Also the key we find it by again. */
export function promoTargetUrl(kind: PromoKind, id: string): string {
  return kind === "COURSE" ? `/courses/${id}` : `/marketplace/${id}`;
}

export type PromoItem = {
  kind: PromoKind;
  id: string;
  title: string;
  image: string | null;
  price: number;
  /** Where it already runs, by placement name. */
  placements: string[];
};

/**
 * Everything sellable that is eligible to be promoted.
 *
 * Only ACTIVE listings and PUBLISHED courses: promoting something a buyer
 * cannot then buy spends an impression to produce a dead end, and on a
 * marketplace listing that has sold it is worse than a dead end.
 */
export async function promotableItems(limit = 60): Promise<PromoItem[]> {
  const [listings, courses, running] = await Promise.all([
    prisma.marketplaceListing.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, images: true, price: true },
    }),
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, thumbnail: true, price: true },
    }),
    runningPromos(),
  ]);

  const byUrl = new Map<string, string[]>();
  for (const r of running) {
    byUrl.set(r.targetUrl, [...(byUrl.get(r.targetUrl) ?? []), r.placement]);
  }

  return [
    ...listings.map((l) => ({
      kind: "LISTING" as const,
      id: l.id,
      title: l.title,
      image: l.images?.[0] ?? null,
      price: toNum(l.price),
      placements: byUrl.get(promoTargetUrl("LISTING", l.id)) ?? [],
    })),
    ...courses.map((c) => ({
      kind: "COURSE" as const,
      id: c.id,
      title: c.title,
      image: c.thumbnail,
      price: toNum(c.price),
      placements: byUrl.get(promoTargetUrl("COURSE", c.id)) ?? [],
    })),
  ];
}

/** Ads in the house campaign that point at one of our own items. */
async function runningPromos(): Promise<
  { adId: string; targetUrl: string; placement: string }[]
> {
  const campaign = await prisma.adCampaign.findFirst({
    where: { title: HOUSE_CAMPAIGN_TITLE },
    select: { id: true },
  });
  if (!campaign) return [];

  const ads = await prisma.ad.findMany({
    where: {
      campaignId: campaign.id,
      status: "ACTIVE",
      OR: [
        { targetUrl: { startsWith: "/marketplace/" } },
        { targetUrl: { startsWith: "/courses/" } },
      ],
    },
    select: { id: true, targetUrl: true, placementId: true },
  });
  if (ads.length === 0) return [];

  const placements = await prisma.adPlacement.findMany({
    where: { id: { in: [...new Set(ads.map((a) => a.placementId))] } },
    select: { id: true, name: true },
  });
  const nameById = new Map(placements.map((p) => [p.id, p.name]));

  return ads
    .filter((a) => a.targetUrl)
    .map((a) => ({
      adId: a.id,
      targetUrl: a.targetUrl as string,
      placement: nameById.get(a.placementId) ?? "",
    }));
}

async function houseCampaignId(): Promise<string> {
  const existing = await prisma.adCampaign.findFirst({
    where: { title: HOUSE_CAMPAIGN_TITLE },
    select: { id: true },
  });
  if (existing) return existing.id;
  const made = await prisma.adCampaign.create({
    data: {
      title: HOUSE_CAMPAIGN_TITLE,
      description:
        "Platform self-promotion. Fills the reward and Browse & Earn spaces so they are never empty. Never billed.",
      budget: 0,
      status: "ACTIVE",
      isHouse: true,
    },
    select: { id: true },
  });
  return made.id;
}

async function loadItem(
  kind: PromoKind,
  id: string
): Promise<{ title: string; image: string | null; price: number } | null> {
  if (kind === "COURSE") {
    const c = await prisma.course.findUnique({
      where: { id },
      select: { title: true, thumbnail: true, price: true, status: true },
    });
    if (!c || c.status !== "PUBLISHED") return null;
    return { title: c.title, image: c.thumbnail, price: toNum(c.price) };
  }
  const l = await prisma.marketplaceListing.findUnique({
    where: { id },
    select: { title: true, images: true, price: true, status: true },
  });
  if (!l || l.status !== "ACTIVE") return null;
  return { title: l.title, image: l.images?.[0] ?? null, price: toNum(l.price) };
}

export type PromoResult = { created: number; updated: number; removed: number };

/**
 * Run one item in exactly the placements given — adding, refreshing and
 * removing so the stored state matches the request.
 *
 * Passing an empty list therefore stops the promo entirely, which is what the
 * admin screen unticking every box means.
 */
export async function setItemPromo(
  kind: PromoKind,
  id: string,
  placementNames: string[]
): Promise<PromoResult> {
  const item = await loadItem(kind, id);
  if (!item) {
    throw new Error(
      kind === "COURSE"
        ? "That course is not published, so it cannot be promoted."
        : "That listing is not active, so it cannot be promoted."
    );
  }
  if (!item.image) {
    throw new Error(
      "This needs a picture before it can be advertised — an ad slot with no creative renders as an empty box."
    );
  }

  const campaignId = await houseCampaignId();
  const targetUrl = promoTargetUrl(kind, id);

  let wanted = await prisma.adPlacement.findMany({
    where: { name: { in: placementNames } },
    select: { id: true, name: true },
  });
  // A slot the admin ticked but that has no row yet would otherwise be dropped
  // in silence — the screen would report success and no ad would ever serve.
  // The canonical list is code; the rows are seeded on demand.
  if (wanted.length < placementNames.length) {
    await ensureDefaultPlacements();
    wanted = await prisma.adPlacement.findMany({
      where: { name: { in: placementNames } },
      select: { id: true, name: true },
    });
    const missing = placementNames.filter((n) => !wanted.some((p) => p.name === n));
    if (missing.length > 0) {
      throw new Error(`Unknown ad placement: ${missing.join(", ")}.`);
    }
  }
  const wantedIds = new Set(wanted.map((p) => p.id));

  const existing = await prisma.ad.findMany({
    where: { campaignId, targetUrl },
    select: { id: true, placementId: true },
  });
  const existingByPlacement = new Map(existing.map((a) => [a.placementId, a.id]));

  const creative = {
    type: "LOCAL",
    format: "NATIVE",
    status: "ACTIVE",
    weight: PROMO_WEIGHT,
    contentUrl: item.image,
    targetUrl,
    headline: item.title.slice(0, 120),
    brandName: kind === "COURSE" ? "Course" : "Marketplace",
    ctaLabel: item.price > 0 ? `Buy — ${usd(item.price)}` : "View",
  };

  let created = 0;
  let updated = 0;
  for (const p of wanted) {
    const adId = existingByPlacement.get(p.id);
    if (adId) {
      // Refresh rather than recreate: the ad keeps its impression and click
      // history, which is the only way to tell whether promoting it worked.
      await prisma.ad.update({
        where: { id: adId },
        data: { ...creative, size: placementSizeKey(p.name) },
      });
      updated++;
    } else {
      await prisma.ad.create({
        data: { ...creative, campaignId, placementId: p.id, size: placementSizeKey(p.name) },
      });
      created++;
    }
  }

  // Anything running where it was not asked for is stopped.
  const stale = existing.filter((a) => !wantedIds.has(a.placementId)).map((a) => a.id);
  let removed = 0;
  if (stale.length > 0) {
    const res = await prisma.ad.deleteMany({ where: { id: { in: stale } } });
    removed = res.count;
  }

  return { created, updated, removed };
}

/**
 * Re-read every promoted item and rewrite its creative.
 *
 * A promo caches the title, picture and price at the moment it was created, so
 * a price change or a new photo leaves the ad advertising something that is no
 * longer true. Anything that has since sold or been unpublished is stopped
 * rather than refreshed — that is the case that actually costs money, because
 * the impression is spent sending someone to a page they cannot buy from.
 */
export async function refreshPromos(): Promise<PromoResult> {
  const running = await runningPromos();
  const byItem = new Map<string, string[]>();
  for (const r of running) {
    byItem.set(r.targetUrl, [...(byItem.get(r.targetUrl) ?? []), r.placement]);
  }

  const out: PromoResult = { created: 0, updated: 0, removed: 0 };
  for (const [targetUrl, placements] of byItem) {
    const isCourse = targetUrl.startsWith("/courses/");
    const id = targetUrl.split("/").pop() ?? "";
    const kind: PromoKind = isCourse ? "COURSE" : "LISTING";
    try {
      const res = await setItemPromo(kind, id, placements);
      out.created += res.created;
      out.updated += res.updated;
      out.removed += res.removed;
    } catch {
      // Sold, unpublished or deleted — stop advertising it.
      const res = await setItemPromo(kind, id, []).catch(() => null);
      if (res) out.removed += res.removed;
      else {
        const campaignId = await houseCampaignId();
        const del = await prisma.ad.deleteMany({ where: { campaignId, targetUrl } });
        out.removed += del.count;
      }
    }
  }
  return out;
}

export function summarisePromos(r: PromoResult): string {
  const bits: string[] = [];
  if (r.created) bits.push(`${r.created} started`);
  if (r.updated) bits.push(`${r.updated} refreshed`);
  if (r.removed) bits.push(`${r.removed} stopped`);
  return bits.length ? bits.join(", ") + "." : "Nothing to change.";
}
