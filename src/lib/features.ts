// Client-safe feature catalog + types. NO server imports (prisma) here, so this
// can be used from client components (admin per-user override UI). Server-only
// resolution helpers live in `src/lib/packages.ts`.

/**
 * Single feature flag a Plan can toggle on/off. Maps 1:1 to a `*Enabled`
 * boolean column on the Package table.
 */
export type PackageFeatureKey =
  // Section-level
  | "tasks"
  | "socialFeed"
  | "referrals"
  | "withdrawals"
  | "marketplace"
  | "boost"
  | "dailyMission"
  | "lottery"
  | "courses"
  | "advertiser"
  | "games"
  | "browseEarn"
  | "rewardedAds"
  | "cpa"
  | "events"
  | "missions"
  | "quizGames"
  | "boards"
  | "leaderboard"
  | "chat"
  | "groups"
  | "affiliate"
  | "socialEarning"
  // Creator/monetization capabilities (admin-grantable per user)
  | "createTasks"
  | "sellCourses"
  | "sellMarketplace"
  | "agencyMode"
  | "shareLinks"
  | "shareYouTube"
  | "targetTasks"
  | "donations"
  // Per-task-type
  | "socialTasks"
  | "proxyTasks"
  | "articleTasks"
  | "videoTasks"
  | "quizTasks"
  | "surveyTasks"
  | "offerwallTasks"
  | "appInstall";

export const FEATURE_TO_COLUMN: Record<PackageFeatureKey, string> = {
  tasks: "tasksEnabled",
  socialFeed: "socialFeedEnabled",
  referrals: "referralsEnabled",
  withdrawals: "withdrawalsEnabled",
  marketplace: "marketplaceEnabled",
  boost: "boostEnabled",
  dailyMission: "dailyMissionEnabled",
  lottery: "lotteryEnabled",
  courses: "coursesEnabled",
  advertiser: "advertiserEnabled",
  games: "gamesEnabled",
  browseEarn: "browseEarnEnabled",
  rewardedAds: "rewardedAdsEnabled",
  cpa: "cpaEnabled",
  events: "eventsEnabled",
  missions: "missionsEnabled",
  quizGames: "quizGamesEnabled",
  boards: "boardsEnabled",
  leaderboard: "leaderboardEnabled",
  chat: "chatEnabled",
  groups: "groupsEnabled",
  affiliate: "affiliateEnabled",
  socialEarning: "socialEarningEnabled",
  createTasks: "createTasksEnabled",
  sellCourses: "sellCoursesEnabled",
  sellMarketplace: "sellMarketplaceEnabled",
  agencyMode: "agencyModeEnabled",
  shareLinks: "shareLinksEnabled",
  shareYouTube: "shareYoutubeEnabled",
  targetTasks: "targetTasksEnabled",
  donations: "donationsEnabled",
  socialTasks: "socialTasksEnabled",
  proxyTasks: "proxyTasksEnabled",
  articleTasks: "articleTasksEnabled",
  videoTasks: "videoTasksEnabled",
  quizTasks: "quizTasksEnabled",
  surveyTasks: "surveyTasksEnabled",
  offerwallTasks: "offerwallTasksEnabled",
  appInstall: "appInstallEnabled",
};

/** All feature keys (stable order) — for iterating overrides + admin UIs. */
export const FEATURE_KEYS = Object.keys(
  FEATURE_TO_COLUMN
) as PackageFeatureKey[];

/** Catalog for admin UIs (package form + per-user overrides). */
export const FEATURES: {
  key: PackageFeatureKey;
  label: string;
  group: "section" | "task" | "creator";
  /**
   * One plain-language line saying what this lets the USER do — the owner's
   * explicit ask for the unified access page. It lives here, beside the key,
   * so it cannot drift away from the list the way a separate copy deck would.
   * Describe the capability, not the column name.
   */
  description: string;
}[] = [
  { key: "tasks", label: "Tasks", group: "section" , description: "Open the Tasks section and earn from tasks at all. Turning this off hides earning entirely." },
  { key: "socialFeed", label: "Social Feed", group: "section" , description: "See and post in the social feed." },
  { key: "referrals", label: "Referrals", group: "section" , description: "Use the referral programme — get a referral link and earn from invites." },
  { key: "withdrawals", label: "Withdrawals", group: "section" , description: "Request a payout of their cash balance. Off means they can earn but not cash out." },
  { key: "marketplace", label: "Marketplace", group: "section" , description: "Browse and buy digital products in the marketplace." },
  { key: "dailyMission", label: "Daily Mission", group: "section" , description: "Take part in daily missions and claim the streak rewards." },
  { key: "lottery", label: "Lottery", group: "section" , description: "Buy tickets and take part in the lottery draws." },
  { key: "courses", label: "Courses", group: "section" , description: "Browse and enrol in courses." },
  { key: "games", label: "HTML5 Games", group: "section" , description: "Play the HTML5 games and earn from them." },
  { key: "browseEarn", label: "Browse & Earn", group: "section", description: "Earn points for time spent viewing pages with ads (/watch-ads)." },
  { key: "rewardedAds", label: "Watch Ads (rewarded)", group: "section", description: "Watch a rewarded video ad to the end for points." },
  { key: "cpa", label: "CPA Offers", group: "section", description: "See and complete CPA partner offers (sign up / install / buy) for rewards." },
  { key: "events", label: "Events", group: "section", description: "Take part in time-limited events and claim their rewards." },
  { key: "missions", label: "Missions", group: "section", description: "Work on missions (goals) and claim their rewards." },
  { key: "quizGames", label: "Quiz Games", group: "section", description: "Play quiz games and win their rewards." },
  { key: "boards", label: "Task Boards", group: "section", description: "Open task boards and claim a board's bundle reward." },
  { key: "leaderboard", label: "Leaderboards", group: "section", description: "See the leaderboards and compete for prizes." },
  { key: "chat", label: "Chat", group: "section", description: "Send and read direct messages." },
  { key: "groups", label: "Groups", group: "section", description: "Create and join groups." },
  { key: "affiliate", label: "Affiliate", group: "section", description: "Join the affiliate programme and earn commission on sales from their links." },
  { key: "socialEarning", label: "Creator earnings (likes & comments)", group: "creator", description: "Earn points when their posts get likes, comments, shares, views and votes (Feed settings → Social earning sets the rates)." },
  // Creator/monetization capabilities (admin-grantable per user)
  { key: "advertiser", label: "Run Ads (advertiser)", group: "creator" , description: "Run their OWN ad campaigns: create ads, fund them and see their own stats. This is the grant for a customer who wants to advertise — NOT the Ad Manager staff role, which controls everyone's campaigns." },
  { key: "boost", label: "Boost Posts", group: "creator" , description: "Pay to boost their own posts so more people see them." },
  { key: "createTasks", label: "Create Tasks", group: "creator" , description: "Publish tasks other users complete for money, and fund them from their buyer balance." },
  { key: "sellCourses", label: "Sell Courses / Tutor", group: "creator" , description: "Create and sell courses. Granting this to a plain user also promotes them to Tutor." },
  { key: "sellMarketplace", label: "Sell on Marketplace", group: "creator" , description: "List and sell digital products in the marketplace." },
  { key: "agencyMode", label: "Agency / Moderator Mode", group: "creator" , description: "Run an agency console — manage campaigns and tasks on behalf of several clients." },
  { key: "shareLinks", label: "Share Links in Posts", group: "creator" , description: "Post clickable external links in the feed. Off by default because it is the main spam vector." },
  { key: "shareYouTube", label: "Share YouTube / Video Links", group: "creator" , description: "Post YouTube and other video links that render as an inline player." },
  { key: "targetTasks", label: "Target Tasks (audience)", group: "creator" , description: "Restrict who sees their tasks by country, division, district, gender and age." },
  { key: "donations", label: "Ask for Donations in Posts", group: "creator" , description: "Add a donation request to their posts and receive money from other users." },
  { key: "socialTasks", label: "Social Tasks", group: "task" , description: "Create SOCIAL tasks (follow, like, share, join). Needed on top of Create Tasks — the API gates this type separately." },
  { key: "proxyTasks", label: "Proxy Tasks", group: "task" , description: "Create PROXY tasks." },
  { key: "articleTasks", label: "Article Tasks", group: "task" , description: "Create ARTICLE reading tasks." },
  { key: "videoTasks", label: "Video Tasks", group: "task" , description: "Create VIDEO watch tasks." },
  { key: "quizTasks", label: "Quiz Tasks", group: "task" , description: "Create QUIZ tasks." },
  { key: "surveyTasks", label: "Survey Tasks", group: "task" , description: "Create SURVEY tasks." },
  { key: "offerwallTasks", label: "Offerwall Tasks", group: "task" , description: "Create OFFERWALL tasks." },
  { key: "appInstall", label: "App Install Tasks", group: "task" , description: "Create APP INSTALL tasks with screenshot proof steps." },
];

/**
 * Features auto-granted by a user's ROLE, on top of their package + overrides.
 * The AGENCY role is a user-side advertiser/agency console, so it always unlocks
 * the advertiser + agency-mode + create-tasks capabilities regardless of plan.
 * (Type-only import of UserRole — no runtime coupling to rbac.ts.)
 */
export const ROLE_FEATURES: Partial<
  Record<import("@/lib/rbac").UserRole, PackageFeatureKey[]>
> = {
  AGENCY: ["advertiser", "agencyMode", "createTasks"],
};

/** Sparse per-user grants/denials that override the package value. */
export type FeatureOverrides = Partial<Record<PackageFeatureKey, boolean>>;

/** Safely read a stored `featureOverrides` JSON into a typed sparse map. */
export function parseFeatureOverrides(v: unknown): FeatureOverrides {
  if (!v || typeof v !== "object") return {};
  const src = v as Record<string, unknown>;
  const out: FeatureOverrides = {};
  for (const k of FEATURE_KEYS) {
    if (typeof src[k] === "boolean") out[k] = src[k] as boolean;
  }
  return out;
}
