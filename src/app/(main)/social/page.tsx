import { auth } from "@/lib/auth";
import { syncCountryMode } from "@/lib/country-mode";
import { bannerMatches } from "@/lib/banner-audience";
import { redirect } from "next/navigation";
import { prisma, safeRead } from "@/lib/prisma";
import { SocialFeedView } from "@/components/user/feed/social-feed-view";
import type { BannerSlide } from "@/components/user/primitives/banner-slider";
import { getTickerPayload } from "@/lib/ticker-server";
import { getTrendingHashtags } from "@/lib/trending";
import { getProfileGateState } from "@/lib/profile-gate-server";
import { ProfileCompletionBanner } from "@/components/user/primitives/profile-completion-banner";
import { getKycPromptState } from "@/lib/kyc-prompt-server";
import { KycPromptBanner } from "@/components/user/primitives/kyc-prompt-banner";
import { getSetting } from "@/lib/system-settings";
import { getHiddenPaths } from "@/lib/page-visibility-server";
import { isGroupsEnabled } from "@/lib/groups-gate";
import {
  DEFAULT_WIDGET_CONFIG,
  normalizeWidgetConfig,
} from "@/lib/feed-widgets";
import { NON_STAFF_WHERE } from "@/lib/staff";
import { normalizeQuickEarn } from "@/lib/feed-quick-earn";
import { normalizeCustomWidgets } from "@/lib/feed-custom-widgets";
import { getEffectiveFeatures } from "@/lib/packages";
import { serveFeedAds } from "@/lib/ad-serve";
import { getAdDensity } from "@/lib/ad-density";

export default async function SocialPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const now = new Date();
  const userId = session.user.id;

  // Every read on this page is a sidebar/discovery widget — none of it is
  // actionable data. A blip upstream should cost the user a widget, not the
  // whole feed, so each degrades to an empty result instead of throwing.
  //
  // ONE round-trip layer for the entire page.
  //
  // This was six: the follow list in front, the twelve-way Promise.all, and then
  // ad density, the groups switch, the hidden-path list and the avatar as four
  // more sequential `await`s behind it. None of them feeds any other — every one
  // needs only `userId` — so five of those six layers were pure waiting. On
  // Accelerate a layer is a full proxy round-trip, which is why /social was the
  // slowest page in the app (2.1s average render, 4.2s worst) despite every
  // individual query being small.
  const [
    followingRows,
    bannerRows,
    tickerPayload,
    bestEarnersRaw,
    whoToFollowRows,
    trendingHashtags,
    gate,
    kycPrompt,
    widgetConfigRaw,
    quickEarnRaw,
    customWidgetsRaw,
    effectiveFeatures,
    initialFeedAds,
    adDensity,
    groupsEnabled,
    hiddenPaths,
    me,
  ] = await Promise.all([
      // Only used to filter a 5-item "who to follow" widget, so it does NOT need
      // the viewer's entire follow list — a user following 5,000 people was
      // loading all 5,000 rows on every /social render.
      safeRead(
        prisma.follow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        [] as { followingId: string }[],
        "social:following"
      ),
      safeRead(
      prisma.banner.findMany({
        where: {
          isActive: true,
          location: { in: ["HOME", "ALL"] },
          OR: [
            { startsAt: null, endsAt: null },
            { startsAt: { lte: now }, endsAt: null },
            { startsAt: null, endsAt: { gte: now } },
            { startsAt: { lte: now }, endsAt: { gte: now } },
          ],
        },
        orderBy: { order: "asc" },
        take: 30,
        // Banners change rarely — serve from Accelerate cache.
        cacheStrategy: { ttl: 300, swr: 600 },
      }),
      [],
      "social:banners"
      ),
      getTickerPayload(),
      // Cheap "top earners" (no 500-user combined-score scan) — cached.
      // Staff are excluded at the query, not after the `take`: filtering five
      // fetched rows down would leave the widget showing three names.
      safeRead(
        prisma.user.findMany({
          where: NON_STAFF_WHERE,
          orderBy: { totalEarnings: "desc" },
          take: 5,
          select: { id: true, name: true, username: true, avatar: true, level: true, totalEarnings: true },
          cacheStrategy: { ttl: 60, swr: 120 },
        }),
        [],
        "social:bestEarners"
      ),
      // Fetch a SHARED candidate pool and filter the viewer out in JS below.
      // The old query embedded `notIn: [...followingIds]`, which made the
      // Accelerate cache key unique per viewer — so it paid the proxy cost for a
      // 0% hit rate, and sent a NOT IN list thousands of ids long.
      safeRead(
        prisma.user.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ followersCount: "desc" }, { totalEarnings: "desc" }],
          take: 30,
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            level: true,
            isBlueVerified: true,
            followersCount: true,
          },
          cacheStrategy: { ttl: 60, swr: 120 },
        }),
        [],
        "social:whoToFollow"
      ),
      getTrendingHashtags(6),
      getProfileGateState(userId),
      getKycPromptState(userId),
      getSetting("feed.sidebar_widgets", DEFAULT_WIDGET_CONFIG),
      getSetting("feed.quick_earn_tiles", null),
      getSetting("feed.custom_widgets", null),
      getEffectiveFeatures(userId),
      // SSR the first in-feed native ad so it's in the initial HTML (unblockable
      // first paint); the client fetches the rest via /api/feed/inline.
      serveFeedAds({ userId, count: 1 }),
      getAdDensity(),
      // Admin switch `ui.groups_enabled` — default off. The server blocks the
      // Groups API regardless; this is what stops the tab being offered.
      isGroupsEnabled(),
      // The toolbar shortcuts are filtered against the same per-user page grants
      // the sidebar uses, so a hidden page is never offered as a shortcut to it.
      getHiddenPaths(userId),
      // The session doesn't carry the avatar — fetch it so the composer shows
      // the user's real picture (kept fresh; PhotoModal calls router.refresh on
      // upload).
      prisma.user
        .findUnique({
          where: { id: userId },
          // The avatar, and the profile the banners are targeted on — the
          // same row, so targeting costs no extra query.
          select: {
            avatar: true,
            country: true,
            region: true,
            division: true,
            district: true,
            subDistrict: true,
            // IP country — the fallback when the profile has none (lib/effective-country).
            lastCountry: true,
            signupCountry: true,
            postalCode: true,
            gender: true,
            dateOfBirth: true,
            kycStatus: true,
          },
          cacheStrategy: { ttl: 10, swr: 30 },
        })
        .catch(() => null),
    ]);

  const followingIds = followingRows.map((f) => f.followingId);
  // Exclude the viewer and anyone they already follow, then take 5.
  const excluded = new Set([userId, ...followingIds]);
  const suggestedToFollow = whoToFollowRows
    .filter((u) => !excluded.has(u.id))
    .slice(0, 5);

  const canBoost = effectiveFeatures.enabled.has("boost");
  const canShareLinks = effectiveFeatures.enabled.has("shareLinks");
  const canShareYouTube = effectiveFeatures.enabled.has("shareYouTube");
  // Staff bypass the donation gate server-side (`!isPrivileged` in POST /api/feed),
  // so the composer has to agree — otherwise an admin is shown no Donation tab
  // for something they are in fact allowed to post.
  const donationRole = session.user.role;
  const canDonate =
    effectiveFeatures.enabled.has("donations") ||
    (!!donationRole && donationRole !== "USER" && donationRole !== "user");

  const quickEarn = normalizeQuickEarn(quickEarnRaw);
  const customWidgets = normalizeCustomWidgets(customWidgetsRaw);
  const widgetConfig = normalizeWidgetConfig(
    widgetConfigRaw,
    customWidgets.map((c) => c.id)
  );

  const bestEarners = bestEarnersRaw.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username,
    avatar: r.avatar,
    level: r.level,
  }));

  await syncCountryMode();
  // Only the banners aimed at this viewer (country, district, upazila,
  // gender, age, KYC — set per banner at /admin/banners).
  const myBanners = bannerRows.filter((b) => bannerMatches(b, me ?? {}));
  const promoRow = myBanners[0];
  const promo = promoRow
    ? {
        title: promoRow.title,
        subtitle: promoRow.subtitle,
        bgGradient: promoRow.bgGradient,
        linkUrl: promoRow.linkUrl,
      }
    : null;

  const banners: BannerSlide[] = myBanners.map((b) => ({
    id: b.id,
    title: b.title,
    subtitle: b.subtitle ?? undefined,
    imageUrl: b.imageUrl ?? undefined,
    videoUrl: b.videoUrl ?? undefined,
    ctaLabel: b.linkUrl ? "Open" : undefined,
    ctaHref: b.linkUrl ?? undefined,
    bgGradient: b.bgGradient ?? undefined,
  }));

  return (
    <>
      {gate.locked && (
        <div className="mb-4">
          <ProfileCompletionBanner
            done={gate.progress.done}
            total={gate.progress.total}
            percentage={gate.progress.percentage}
          />
        </div>
      )}
      {kycPrompt.show && (
        <div className="mb-4">
          <KycPromptBanner />
        </div>
      )}
      <SocialFeedView
        user={{
        id: session.user.id,
        name: session.user.name ?? null,
        avatar: me?.avatar ?? null,
        role: session.user.role ?? null,
      }}
      initialBanners={banners}
      initialFeedAd={initialFeedAds[0] ?? null}
      bestEarners={bestEarners}
      whoToFollow={suggestedToFollow}
      trendingHashtags={trendingHashtags}
      promo={promo}
      widgetConfig={widgetConfig}
      quickEarn={quickEarn}
      customWidgets={customWidgets}
      initialTicker={tickerPayload?.items ?? []}
      canBoost={canBoost}
      canShareLinks={canShareLinks}
      canShareYouTube={canShareYouTube}
      canDonate={canDonate}
      feedAdInterval={adDensity.feedAdInterval}
      underPostBanner={adDensity.underPostBanner}
      underPostInterval={adDensity.underPostInterval}
      groupsEnabled={groupsEnabled}
      hiddenPaths={new Set(hiddenPaths)}
      tickerConfig={
        tickerPayload
          ? {
              showAmount: tickerPayload.config.show_amount,
              showMethod: tickerPayload.config.show_method,
              showCountry: tickerPayload.config.show_country,
              speedSec: Math.max(
                5,
                Math.round(tickerPayload.config.scroll_speed_ms / 1000)
              ),
            }
          : undefined
      }
      />
    </>
  );
}
