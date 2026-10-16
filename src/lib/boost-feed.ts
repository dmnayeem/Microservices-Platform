import "server-only";
import { prisma } from "@/lib/prisma";
import { currentDevice } from "@/lib/device-current";
import { effectiveCountry } from "@/lib/effective-country";
import { syncCountryMode } from "@/lib/country-mode";
import { getEffectivePackage } from "@/lib/packages";
import { matchesTargeting, type TargetableUser } from "@/lib/ad-targeting";
import { chargeBoostEvent, getBoostPricing } from "@/lib/boost/core";
import type { BoostEventKind } from "@/lib/boost/pricing";

/**
 * Feed side of post boosts (owner, 2026-10-16): who is shown which boost, and
 * the server-side engagement charges. The money itself lives in
 * src/lib/boost/core.ts — nothing here writes a balance.
 *
 * `PostBoostView` is the delivery record: one row per (viewer, post), bumped
 * every time the feed hands that viewer the boosted post. It is what
 * `maxPerViewer` counts, and what the event endpoint checks before charging —
 * a viewer can only be charged for a boost the feed actually served them.
 */

/** Everything targeting can filter on, plus the bits the boost paths need. */
export type BoostViewer = TargetableUser & { id: string; status: string | null };

const VIEWER_SELECT = {
  status: true,
  country: true,
  region: true,
  division: true,
  district: true,
  subDistrict: true,
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
 * The viewer as the targeting matcher sees them. `country` is the ISO2 code
 * from `effectiveCountry` (profile, else IP; IP only when the admin says so) —
 * the same rule tasks and ads use, so "Bangladesh only" means the same thing.
 */
export async function loadBoostViewer(userId: string, withDevice = true): Promise<BoostViewer | null> {
  const [u, pkg, device] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: VIEWER_SELECT,
      // Targeting attributes change rarely.
      cacheStrategy: { ttl: 60, swr: 300 },
    }),
    getEffectivePackage(userId).catch(() => null),
    withDevice ? currentDevice() : Promise.resolve(undefined),
    syncCountryMode(),
  ]);
  if (!u) return null;
  return {
    ...u,
    id: userId,
    packageSlug: pkg?.slug ?? null,
    device: device ?? undefined,
    country: effectiveCountry(u),
  };
}

/** Don't hand the same boost to the same viewer again within this gap — otherwise
 *  every page of one scroll would repeat it until `maxPerViewer` was used up. */
const REPEAT_GAP_MS = 15 * 60_000;

export type FeedBoostPick = { campaignId: string; postId: string };

/**
 * Pick up to `max` boosts for one feed page.
 *
 * Eligible: ACTIVE and not ended, its post visible and outside any group, not
 * the viewer's own, author not banned, targeting matches the viewer, the
 * viewer has not hit `maxPerViewer` and was not shown it in the last 15 min.
 *
 * Rotation is a weighted draw without replacement over ALL eligible boosts,
 * weight = √(budget left). Proportional weighting would let one big budget
 * starve every small one; the square root still favours bigger spenders but
 * gives each live boost a real chance on every page.
 */
export async function pickFeedBoosts(opts: {
  viewer: BoostViewer;
  hiddenAuthors: string[];
  exclude: Set<string>;
  max: number;
}): Promise<FeedBoostPick[]> {
  if (opts.max <= 0) return [];
  const pricing = await getBoostPricing();
  // Floored to the minute so the cached read keeps one key for everybody.
  const nowMin = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const rows = await prisma.boostCampaign.findMany({
    where: {
      status: "ACTIVE",
      endsAt: { gt: nowMin },
      post: { isHidden: false, groupId: null },
    },
    select: {
      id: true,
      postId: true,
      userId: true,
      targeting: true,
      budgetPoints: true,
      spentPoints: true,
      refundedPoints: true,
      post: { select: { userId: true } },
    },
    take: 1000,
    // The same list for every viewer; per-viewer filtering happens below.
    cacheStrategy: { ttl: 15, swr: 30 },
  });
  const hidden = new Set(opts.hiddenAuthors);
  const eligible = rows.filter(
    (c): c is typeof c & { postId: string } =>
      !!c.postId &&
      c.userId !== opts.viewer.id &&
      c.post?.userId !== opts.viewer.id &&
      !hidden.has(c.post?.userId ?? "") &&
      !opts.exclude.has(c.postId) &&
      c.budgetPoints - c.spentPoints - c.refundedPoints > 0 &&
      matchesTargeting(c.targeting, opts.viewer)
  );
  if (eligible.length === 0) return [];

  const views = await prisma.postBoostView.findMany({
    where: { userId: opts.viewer.id, postId: { in: eligible.map((c) => c.postId) } },
    select: { postId: true, count: true, lastShownAt: true },
  });
  const seen = new Map(views.map((v) => [v.postId, v]));
  const cap = pricing.maxPerViewer; // 0 = unlimited
  const recent = Date.now() - REPEAT_GAP_MS;
  const pool = eligible
    .filter((c) => {
      const v = seen.get(c.postId);
      if (!v) return true;
      if (cap > 0 && v.count >= cap) return false;
      return v.lastShownAt.getTime() < recent;
    })
    .map((c) => ({ c, w: Math.sqrt(Math.max(1, c.budgetPoints - c.spentPoints - c.refundedPoints)) }));

  const picks: FeedBoostPick[] = [];
  const usedPosts = new Set<string>();
  while (picks.length < opts.max && pool.length > 0) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= pool[i].w;
      if (r <= 0) break;
    }
    const [{ c }] = pool.splice(i, 1);
    if (usedPosts.has(c.postId)) continue;
    usedPosts.add(c.postId);
    picks.push({ campaignId: c.id, postId: c.postId });
  }

  // Recorded BEFORE the page is returned: the event endpoint refuses to charge
  // for a boost this table says the viewer was never served.
  await Promise.all(
    picks.map((p) =>
      prisma.postBoostView
        .upsert({
          where: { userId_postId: { userId: opts.viewer.id, postId: p.postId } },
          create: { userId: opts.viewer.id, postId: p.postId, count: 1 },
          update: { count: { increment: 1 }, lastShownAt: new Date() },
        })
        .catch(() => {})
    )
  );
  return picks;
}

/** Was this boost served to this viewer (since it started running)? */
export async function boostWasServed(viewerId: string, postId: string, startsAt: Date | null): Promise<boolean> {
  const v = await prisma.postBoostView.findUnique({
    where: { userId_postId: { userId: viewerId, postId } },
    select: { lastShownAt: true },
  });
  return !!v && (!startsAt || v.lastShownAt >= startsAt);
}

/**
 * After a successful like / comment / share: when the post has a running boost
 * and the actor reached it through that boost, charge the event. Organic
 * engagement from people who never saw the boost is not billed to the owner.
 *
 * "Reached it through the boost" = an IMPRESSION/VIEW event on the campaign,
 * or — when the admin charges neither, so no such event is ever written — the
 * feed's delivery record since the boost started. Never throws.
 */
export async function chargeBoostEngagement(
  postId: string,
  actorId: string,
  kind: Extract<BoostEventKind, "LIKE" | "COMMENT" | "SHARE">
): Promise<void> {
  try {
    const c = await prisma.boostCampaign.findFirst({
      where: { postId, status: "ACTIVE" },
      select: { id: true, userId: true, startsAt: true },
    });
    if (!c || c.userId === actorId) return;
    const [ev, served] = await Promise.all([
      prisma.boostEvent.findFirst({
        where: { campaignId: c.id, viewerId: actorId, kind: { in: ["IMPRESSION", "VIEW"] } },
        select: { id: true },
      }),
      boostWasServed(actorId, postId, c.startsAt),
    ]);
    if (!ev && !served) return;
    const viewer = await loadBoostViewer(actorId, false);
    if (!viewer || viewer.status === "BANNED" || viewer.status === "SUSPENDED") return;
    await chargeBoostEvent({ campaignId: c.id, viewerId: actorId, kind, country: viewer.country ?? null });
  } catch (e) {
    console.error("chargeBoostEngagement failed:", e);
  }
}
