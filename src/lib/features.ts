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
  // Creator/monetization capabilities (admin-grantable per user)
  | "createTasks"
  | "sellCourses"
  | "sellMarketplace"
  | "agencyMode"
  | "shareLinks"
  | "shareYouTube"
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
  createTasks: "createTasksEnabled",
  sellCourses: "sellCoursesEnabled",
  sellMarketplace: "sellMarketplaceEnabled",
  agencyMode: "agencyModeEnabled",
  shareLinks: "shareLinksEnabled",
  shareYouTube: "shareYoutubeEnabled",
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
}[] = [
  { key: "tasks", label: "Tasks", group: "section" },
  { key: "socialFeed", label: "Social Feed", group: "section" },
  { key: "referrals", label: "Referrals", group: "section" },
  { key: "withdrawals", label: "Withdrawals", group: "section" },
  { key: "marketplace", label: "Marketplace", group: "section" },
  { key: "dailyMission", label: "Daily Mission", group: "section" },
  { key: "lottery", label: "Lottery", group: "section" },
  { key: "courses", label: "Courses", group: "section" },
  { key: "games", label: "HTML5 Games", group: "section" },
  // Creator/monetization capabilities (admin-grantable per user)
  { key: "advertiser", label: "Run Ads (advertiser)", group: "creator" },
  { key: "boost", label: "Boost Posts", group: "creator" },
  { key: "createTasks", label: "Create Tasks", group: "creator" },
  { key: "sellCourses", label: "Sell Courses / Tutor", group: "creator" },
  { key: "sellMarketplace", label: "Sell on Marketplace", group: "creator" },
  { key: "agencyMode", label: "Agency / Moderator Mode", group: "creator" },
  { key: "shareLinks", label: "Share Links in Posts", group: "creator" },
  { key: "shareYouTube", label: "Share YouTube / Video Links", group: "creator" },
  { key: "socialTasks", label: "Social Tasks", group: "task" },
  { key: "proxyTasks", label: "Proxy Tasks", group: "task" },
  { key: "articleTasks", label: "Article Tasks", group: "task" },
  { key: "videoTasks", label: "Video Tasks", group: "task" },
  { key: "quizTasks", label: "Quiz Tasks", group: "task" },
  { key: "surveyTasks", label: "Survey Tasks", group: "task" },
  { key: "offerwallTasks", label: "Offerwall Tasks", group: "task" },
  { key: "appInstall", label: "App Install Tasks", group: "task" },
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
