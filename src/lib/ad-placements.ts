/**
 * Canonical ad placements (slots) across the platform. Each maps to a
 * `<AdRenderer placement="NAME">` mounted somewhere in the UI. The `name` is the
 * unique key stored in the AdPlacement table and passed to /api/ads/serve.
 *
 * NOTE: this file must stay client-safe (no prisma import) — it is imported by
 * the client AdManagerView. Server-only helpers live in ./ad-placements-server.
 */
export const AD_PLACEMENTS = [
  { name: "TASK_LIST", label: "Task List", description: "Top of the tasks hub and task list pages.", where: "Tasks hub (/tasks) — top" },
  { name: "TASK_START", label: "Task Start", description: "Article / video / survey task detail pages.", where: "Task detail pages (/tasks/…)" },
  { name: "VIDEO_ABOVE", label: "Video — Above", description: "Above the video player while watching.", where: "Video task page — above player" },
  { name: "VIDEO_BELOW", label: "Video — Below", description: "Below the video player while watching.", where: "Video task page — below player" },
  { name: "VIDEO_OVERLAY", label: "Video — Overlay", description: "Dismissible banner strip pinned over the bottom of the playing video (video / YouTube / social watch tasks).", where: "Over the video player — bottom" },
  { name: "TASK_COMPLETE", label: "Task Complete", description: "Task completion / reward screens.", where: "Task reward / completion screen" },
  { name: "IN_FEED", label: "Social Feed", description: "Native ad interleaved in the social feed.", where: "Inside the social feed (/social)" },
  { name: "FEED_POST_BELOW", label: "Under Post Banner", description: "Banner shown under posts in the social feed (admin-set interval).", where: "Social feed (/social) — under posts" },
  { name: "FEED_SIDEBAR", label: "Feed Sidebar", description: "Sponsored card in the social feed right rail.", where: "Social feed (/social) — right sidebar" },
  { name: "DASHBOARD", label: "Dashboard", description: "User dashboard banner.", where: "Dashboard (/) — top banner" },
  { name: "EARN_HUB", label: "Earn Hub", description: "Earn hub banner.", where: "Earn hub (/earn) — banner" },
  { name: "EARN_BROWSE", label: "Browse & Earn", description: "Ads shown on the Browse & Earn page — users earn points for viewing; every rotation is a CPM impression.", where: "Browse & Earn page (/watch-ads)" },
  { name: "WALLET_TOP", label: "Wallet", description: "Top of the wallet page.", where: "Wallet page (/wallet) — top" },
  { name: "MARKETPLACE_TOP", label: "Marketplace", description: "Top of the marketplace.", where: "Marketplace (/marketplace) — top" },
  { name: "PROFILE_BOTTOM", label: "Profile", description: "Bottom of user profiles.", where: "Profile page (/profile) — bottom" },
  { name: "GAME_INTERSTITIAL", label: "Game Interstitial", description: "Full-screen ad on game open / resume / quit.", where: "Games — full-screen on open/resume/quit" },
  { name: "VIDEO_INTERSTITIAL", label: "Video Interstitial", description: "Full-screen ad on video task open / before reward.", where: "Video tasks — full-screen before reward" },
  { name: "REWARD_INTERSTITIAL", label: "Reward Interstitial", description: "Full-screen ad shown on every task submit / reward claim, before the reward is revealed.", where: "Every task submit & reward claim" },

  // ── Anchor + per-page top slots (Phase 3) ────────────────────────────────
  // Before these, 27 of the 50 route trees under (main) rendered no ad at all,
  // including two of the three bottom-nav tabs. The anchor covers the tail with
  // one mount; the named slots exist so per-page revenue is reportable — a
  // single shared PAGE_TOP would make every one of them indistinguishable in
  // the very report that decides which pages are worth a slot.
  { name: "ANCHOR_BOTTOM", label: "Anchor Bar", description: "Sticky bar pinned to the bottom of every authenticated page, above the mobile nav. Dismissible for the session.", where: "Every page in the app — bottom" },
  { name: "WITHDRAW_TOP", label: "Withdrawal", description: "Top of the withdrawal page — the longest-dwell page on the platform.", where: "Withdrawal (/withdrawal) — top" },
  { name: "LEADERBOARD_TOP", label: "Leaderboard", description: "Top of the leaderboard.", where: "Leaderboard (/leaderboard) — top" },
  { name: "QUIZZES_TOP", label: "Quizzes", description: "Top of the quizzes list and quiz pages.", where: "Quizzes (/quizzes) — top" },
  { name: "DEPOSIT_TOP", label: "Deposit", description: "Top of the deposit page.", where: "Deposit (/deposit) — top" },
  { name: "PACKAGES_TOP", label: "Packages", description: "Top of the packages page.", where: "Packages (/packages) — top" },
  { name: "NOTIFICATIONS_TOP", label: "Notifications", description: "Top of the notifications list.", where: "Notifications (/notifications) — top" },
  { name: "REFERRALS_TOP", label: "Referrals", description: "Top of the referrals page.", where: "Referrals (/referrals) — top" },
  { name: "DAILY_MISSION_TOP", label: "Daily Mission", description: "Top of the daily mission page.", where: "Daily Mission (/daily-mission) — top" },

  // Watch-to-earn video. Incentivised by definition — the user is paid points
  // for watching — so Google inventory is barred from it in code, not by memory.
  { name: "REWARDED_VIDEO", label: "Rewarded Video", description: "Watch-to-earn video ads. The user is paid points for watching, so own/direct-sold inventory only.", where: "Browse & Earn page (/watch-ads) — watch to earn" },
] as const;

export type AdPlacementName = (typeof AD_PLACEMENTS)[number]["name"];

/**
 * Human name for a space, for error messages and admin UI. Lives here rather
 * than in the admin view so a server route can name the space it rejected.
 */
export const PLACEMENT_LABEL: Record<string, string> = Object.fromEntries(
  AD_PLACEMENTS.map((p) => [p.name, p.label])
);

export function placementLabel(name: string): string {
  return PLACEMENT_LABEL[name] ?? name;
}

/**
 * What a space will actually accept and how tall it may ever get.
 *
 * This replaces a bare "recommended size" map that nothing enforced. The result
 * was that any size could be put in any space — and since `Ad.size` defaults to
 * `"responsive"`, which `resolveAdSize()` turns into "no dimensions at all", the
 * renderer applied no `maxWidth`, no aspect ratio and (anywhere in the file) no
 * max height. A tall creative in a banner slot rendered `w-full h-auto` and ran
 * for several screens. The loading skeleton, meanwhile, *was* shaped from the
 * space — so the layout jumped the moment the ad arrived.
 *
 * `maxHeightPx` is the important field: it is enforced at render time, so it
 * also protects against every row already in the database, which no write-time
 * validation can reach.
 *
 * `networkAllowed: false` marks INCENTIVISED inventory — surfaces where the user
 * is being paid, or is being shown the ad in order to receive a reward. Google's
 * AdSense and Ad Manager policies prohibit their ads on incentivised placements,
 * and breaching that is the usual way a publisher account gets actioned. Those
 * spaces take own/direct-sold (`LOCAL`) and `HTML` creatives only, and the rule
 * is enforced server-side rather than left to be remembered.
 */
export interface PlacementSpec {
  /** `AD_SIZES` keys this space accepts. First entry is the default/prefill. */
  sizes: string[];
  /** Hard ceiling applied by the renderer, in CSS pixels. */
  maxHeightPx: number;
  /** May Google (ADSENSE / GAM) creatives run here? False = incentivised. */
  networkAllowed: boolean;
  /**
   * Let the creative fill its column instead of being capped at the preset
   * width.
   *
   * The width cap exists so a 300px creative is not marooned in the middle of a
   * 1216px band. In a column that is narrow BY CONSTRUCTION — the feed rail —
   * the cap does the opposite: it leaves the ad visibly smaller than every
   * widget stacked under it, which is exactly what widening the rail from 320
   * to 416 exposed.
   */
  fillsColumn?: boolean;
}

/** Full-screen spaces size themselves; the overlay ignores `Ad.size` entirely. */
const INTERSTITIAL_SPEC: PlacementSpec = {
  sizes: ["story", "responsive", "medium", "large_square"],
  maxHeightPx: 1920,
  networkAllowed: false, // shown to unlock a reward — incentivised
};

const LEADERBOARD_SPEC: PlacementSpec = {
  sizes: ["leaderboard", "banner", "mobile", "responsive"],
  maxHeightPx: 120,
  networkAllowed: true,
};

const RECTANGLE_SPEC: PlacementSpec = {
  sizes: ["medium", "large_square", "square", "responsive"],
  maxHeightPx: 300,
  networkAllowed: true,
};

export const PLACEMENT_SPEC: Record<string, PlacementSpec> = {
  TASK_LIST: LEADERBOARD_SPEC,
  TASK_START: LEADERBOARD_SPEC,
  VIDEO_ABOVE: LEADERBOARD_SPEC,
  VIDEO_BELOW: LEADERBOARD_SPEC,
  // A strip pinned over the player — deliberately shorter than a leaderboard.
  VIDEO_OVERLAY: { sizes: ["mobile", "banner", "responsive"], maxHeightPx: 72, networkAllowed: true },
  TASK_COMPLETE: RECTANGLE_SPEC,
  // The native feed card defines its own geometry and never reads `Ad.size`.
  IN_FEED: { sizes: ["responsive"], maxHeightPx: 400, networkAllowed: true },
  // Sits between a post and its like/comment row — must stay small.
  FEED_POST_BELOW: { sizes: ["mobile", "banner", "responsive"], maxHeightPx: 72, networkAllowed: true },
  // The rail is 320–416px wide depending on the breakpoint, and every other
  // widget in it is full-width. `fillsColumn` keeps the ad the same width as its
  // neighbours instead of pinning it to the 300px preset.
  FEED_SIDEBAR: { ...RECTANGLE_SPEC, fillsColumn: true },
  DASHBOARD: LEADERBOARD_SPEC,
  EARN_HUB: LEADERBOARD_SPEC,
  // Users are paid points for viewing this page — incentivised by definition.
  EARN_BROWSE: { ...RECTANGLE_SPEC, networkAllowed: false },
  WALLET_TOP: LEADERBOARD_SPEC,
  MARKETPLACE_TOP: LEADERBOARD_SPEC,
  PROFILE_BOTTOM: RECTANGLE_SPEC,
  GAME_INTERSTITIAL: INTERSTITIAL_SPEC,
  VIDEO_INTERSTITIAL: INTERSTITIAL_SPEC,
  REWARD_INTERSTITIAL: INTERSTITIAL_SPEC,

  // The anchor is deliberately the shortest space on the platform. It is pinned
  // over the page on every screen, so anything taller than a mobile banner stops
  // being an ad and starts being a second navigation bar.
  // No "leaderboard" here: 728x90 cannot render inside a 64px bar, so offering
  // it meant an advertiser could buy a size that arrives letterboxed. `banner`
  // (468x60) is the tallest preset that actually fits.
  ANCHOR_BOTTOM: { sizes: ["mobile", "banner", "responsive"], maxHeightPx: 64, networkAllowed: true },

  WITHDRAW_TOP: LEADERBOARD_SPEC,
  LEADERBOARD_TOP: LEADERBOARD_SPEC,
  QUIZZES_TOP: LEADERBOARD_SPEC,
  DEPOSIT_TOP: LEADERBOARD_SPEC,
  PACKAGES_TOP: LEADERBOARD_SPEC,
  NOTIFICATIONS_TOP: LEADERBOARD_SPEC,
  REFERRALS_TOP: LEADERBOARD_SPEC,
  DAILY_MISSION_TOP: LEADERBOARD_SPEC,

  // A video player, not a banner: it sizes itself and the user is paid to watch
  // it, so no Google creative may run here.
  REWARDED_VIDEO: { sizes: ["responsive", "medium", "large_square"], maxHeightPx: 720, networkAllowed: false },
};

/** An unknown space falls back to the most restrictive sensible shape. */
const DEFAULT_SPEC: PlacementSpec = LEADERBOARD_SPEC;

export function placementSpec(name: string): PlacementSpec {
  return PLACEMENT_SPEC[name] ?? DEFAULT_SPEC;
}

/** The `AD_SIZES` key recommended for a placement — the spec's first entry. */
export function placementSizeKey(name: string): string {
  return placementSpec(name).sizes[0];
}

/** Would this creative size be accepted in this space? */
export function sizeFitsPlacement(placementName: string, size?: string | null): boolean {
  const spec = placementSpec(placementName);
  // `custom` is admin-only and validated on its pixel dimensions instead.
  if (size === "custom") return true;
  return spec.sizes.includes(size || "responsive");
}

/** May this `Ad.type` run in this space? See `networkAllowed` above. */
export function typeFitsPlacement(placementName: string, type?: string | null): boolean {
  if (type !== "ADSENSE" && type !== "GAM") return true;
  return placementSpec(placementName).networkAllowed;
}

export interface AdFitProblem {
  field: "size" | "type" | "height";
  message: string;
}

/**
 * Validate a creative against the space it is being placed in. Returns every
 * problem rather than the first, so an admin fixing a form sees all of it.
 *
 * Deliberately a rejection, not a silent clamp: an admin who chose the wrong
 * size should be told which sizes the space takes, not quietly given a third
 * value they did not pick.
 */
export function checkAdFitsPlacement(args: {
  placementName: string;
  placementLabel?: string;
  size?: string | null;
  width?: number | null;
  height?: number | null;
  type?: string | null;
}): AdFitProblem[] {
  const spec = placementSpec(args.placementName);
  const where = args.placementLabel || args.placementName;
  const out: AdFitProblem[] = [];

  if (!sizeFitsPlacement(args.placementName, args.size)) {
    out.push({
      field: "size",
      message: `"${args.size}" doesn't fit ${where}. That space takes: ${spec.sizes.join(", ")}.`,
    });
  }

  if (args.size === "custom") {
    const h = Number(args.height);
    const w = Number(args.width);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      out.push({
        field: "height",
        message: "A custom size needs both a width and a height in pixels.",
      });
    } else if (h > spec.maxHeightPx) {
      out.push({
        field: "height",
        message: `${h}px is taller than ${where} allows (max ${spec.maxHeightPx}px).`,
      });
    }
  }

  if (!typeFitsPlacement(args.placementName, args.type)) {
    out.push({
      field: "type",
      message: `Google ads (AdSense / Ad Manager) can't run in ${where}. Users are shown that space to earn or unlock a reward, and Google's policies prohibit their ads on incentivised placements — running them there risks the account. Use your own or a direct-sold creative.`,
    });
  }

  return out;
}

/**
 * Inventory a self-serve advertiser may buy. Interstitials and Browse & Earn are
 * house/CPM surfaces the platform monetizes itself, so they stay admin-only —
 * both in the advertiser UI and in the API, which must not trust the client.
 */
const HOUSE_ONLY_PLACEMENTS = new Set<string>([
  "GAME_INTERSTITIAL",
  "VIDEO_INTERSTITIAL",
  "REWARD_INTERSTITIAL",
  "EARN_BROWSE",
  "REWARDED_VIDEO",
]);

export function isAdvertiserSelectable(name: string): boolean {
  return !HOUSE_ONLY_PLACEMENTS.has(name);
}

/** Placements offered in the self-serve ad composer. */
export const ADVERTISER_PLACEMENTS = AD_PLACEMENTS.filter((p) =>
  isAdvertiserSelectable(p.name)
);

/**
 * Full-screen, shown-before-a-reward inventory.
 *
 * `serveAd` already branches on `name.endsWith("_INTERSTITIAL")`; this exports
 * the same rule so callers that let an admin *choose* a placement (per-game ad
 * config) can reject anything else. Pointing a game at `IN_FEED` would serve
 * advertiser inventory full-screen in a slot it was never bought for.
 */
export function isInterstitialPlacement(name: string): boolean {
  return AD_PLACEMENTS.some(
    (p) => p.name === name && p.name.endsWith("_INTERSTITIAL")
  );
}

/**
 * Every route where the user is PAID to be on the page.
 *
 * `networkAllowed: false` above governs the slots *we* render. It does not
 * govern Auto ads, which Google injects from the page-level `adsbygoogle.js`
 * wherever it decides to — so the policy was enforced for the ads we ask for and
 * unenforced for the ads Google places itself. Since `NetworkScripts` is mounted
 * in the ROOT layout, that script would load on every one of these pages the
 * moment a publisher id is saved. An Auto ad on an incentivised page is the
 * specific thing that gets an AdSense account banned.
 *
 * This list is therefore the one place that answers "is the user being paid to
 * look at this screen", and it is used to decide whether Google's scripts load
 * at all (`src/components/providers/network-scripts.tsx`).
 *
 * Prefix match: a nested route under one of these is covered too.
 * `scripts/verify-launch-todos.ts` asserts every entry resolves to a real route,
 * so renaming a page fails the build check rather than silently losing cover.
 */
export const INCENTIVISED_PREFIXES = [
  // Task surfaces — every one of these pays points on completion.
  "/tasks",
  "/app-install-tasks",
  "/article-tasks",
  "/board-tasks",
  "/custom-tasks",
  "/manual-tasks",
  "/proxy-tasks",
  "/quiz-tasks",
  "/social-tasks",
  "/survey-tasks",
  "/video-tasks",
  // Paid-attention surfaces.
  "/watch-ads",
  "/earn",
  "/games",
  "/offerwalls",
  "/offer",
  // Reward loops.
  "/daily-mission",
  "/missions",
  "/milestones",
  "/lottery",
  "/quizzes",
] as const;

/** Is the user being paid to be on this path? Prefix match, nested included. */
export function isIncentivisedPath(pathname: string): boolean {
  return INCENTIVISED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Routes the sticky anchor bar must NOT appear on.
 *
 * `ANCHOR_BOTTOM` carries Google inventory (`networkAllowed: true`), and it is
 * mounted once in the app shell, so it would otherwise land on every screen —
 * including the ones where the user is being PAID to be there.
 *
 * Derived from `INCENTIVISED_PREFIXES` rather than kept as its own list: this
 * used to be just `["/watch-ads"]`, which was correct for the bar but far
 * narrower than the real set of paid surfaces. Two hand-maintained lists of "the
 * pages Google's ads must not touch" would drift, and the narrower one would win
 * silently.
 */
export const ANCHOR_DENY_PREFIXES = INCENTIVISED_PREFIXES;

export function anchorAllowedOnPath(pathname: string): boolean {
  return !isIncentivisedPath(pathname);
}

/** Placements a game may be pointed at. */
export const GAME_AD_PLACEMENTS = AD_PLACEMENTS.filter((p) =>
  isInterstitialPlacement(p.name)
);
