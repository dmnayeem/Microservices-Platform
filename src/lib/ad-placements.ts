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
] as const;

export type AdPlacementName = (typeof AD_PLACEMENTS)[number]["name"];

/**
 * Recommended creative size per placement (an `AD_SIZES` key). Drives the admin
 * space preview aspect-ratio + size label, and pre-fills the ad's default size
 * when creating an ad for that space. Unlisted placements → "responsive".
 */
export const PLACEMENT_SIZE: Record<string, string> = {
  TASK_LIST: "leaderboard",
  TASK_START: "leaderboard",
  VIDEO_ABOVE: "leaderboard",
  VIDEO_BELOW: "leaderboard",
  VIDEO_OVERLAY: "leaderboard",
  TASK_COMPLETE: "medium",
  IN_FEED: "responsive",
  FEED_POST_BELOW: "medium",
  FEED_SIDEBAR: "medium",
  DASHBOARD: "leaderboard",
  EARN_HUB: "leaderboard",
  EARN_BROWSE: "medium",
  WALLET_TOP: "leaderboard",
  MARKETPLACE_TOP: "leaderboard",
  PROFILE_BOTTOM: "medium",
  GAME_INTERSTITIAL: "story",
  VIDEO_INTERSTITIAL: "story",
  REWARD_INTERSTITIAL: "story",
};

/** The `AD_SIZES` key recommended for a placement (defaults to "responsive"). */
export function placementSizeKey(name: string): string {
  return PLACEMENT_SIZE[name] ?? "responsive";
}
