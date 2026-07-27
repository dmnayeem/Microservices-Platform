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
  { name: "TASK_COMPLETE", label: "Task Complete", description: "Task completion / reward screens.", where: "Task reward / completion screen" },
  { name: "IN_FEED", label: "Social Feed", description: "Native ad interleaved in the social feed.", where: "Inside the social feed (/social)" },
  { name: "FEED_SIDEBAR", label: "Feed Sidebar", description: "Sponsored card in the social feed right rail.", where: "Social feed (/social) — right sidebar" },
  { name: "DASHBOARD", label: "Dashboard", description: "User dashboard banner.", where: "Dashboard (/) — top banner" },
  { name: "EARN_HUB", label: "Earn Hub", description: "Earn hub banner.", where: "Earn hub (/earn) — banner" },
  { name: "WALLET_TOP", label: "Wallet", description: "Top of the wallet page.", where: "Wallet page (/wallet) — top" },
  { name: "MARKETPLACE_TOP", label: "Marketplace", description: "Top of the marketplace.", where: "Marketplace (/marketplace) — top" },
  { name: "PROFILE_BOTTOM", label: "Profile", description: "Bottom of user profiles.", where: "Profile page (/profile) — bottom" },
  { name: "GAME_INTERSTITIAL", label: "Game Interstitial", description: "Full-screen ad on game open / resume / quit.", where: "Games — full-screen on open/resume/quit" },
  { name: "VIDEO_INTERSTITIAL", label: "Video Interstitial", description: "Full-screen ad on video task open / before reward.", where: "Video tasks — full-screen before reward" },
  { name: "REWARD_INTERSTITIAL", label: "Reward Interstitial", description: "Full-screen ad shown on every task submit / reward claim, before the reward is revealed.", where: "Every task submit & reward claim" },
] as const;

export type AdPlacementName = (typeof AD_PLACEMENTS)[number]["name"];
