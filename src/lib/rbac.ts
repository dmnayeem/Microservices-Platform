// RBAC (Role-Based Access Control) Configuration
// Based on admin_oo.md specification (33 modules across 6 categories)

// Note: We define UserRole locally for client components
// This should match the enum in prisma/schema.prisma
export type UserRole =
  | "USER"
  | "TUTOR"
  | "SUPER_ADMIN"
  // Generic admin below super-admin; also the baseline role of custom-role users.
  | "ADMIN"
  | "FINANCE_ADMIN"
  | "CONTENT_ADMIN"
  | "SUPPORT_ADMIN"
  | "MARKETING_ADMIN"
  | "MODERATOR"
  // Advertiser/agency console — a user-side role (NOT in the admin panel).
  | "AGENCY"
  // Ad Manager admin — scoped to the Ads Manager surface.
  | "AD_MANAGER";

// Admin roles that have access to admin panel.
// AGENCY is intentionally excluded — it is a user-side advertiser console.
export const ADMIN_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "FINANCE_ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "MARKETING_ADMIN",
  "MODERATOR",
  "AD_MANAGER",
];

// String array version for client components
export const ADMIN_ROLE_STRINGS = [
  "SUPER_ADMIN",
  "ADMIN",
  "FINANCE_ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "MARKETING_ADMIN",
  "MODERATOR",
  "AD_MANAGER",
] as const;

// Sidebar category groups
export type ModuleCategory =
  | "CORE"
  | "FINANCE"
  | "PLATFORM"
  | "SECURITY"
  | "MARKETING"
  | "SYSTEM";

export const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  CORE: "",
  FINANCE: "Finance",
  PLATFORM: "Platform",
  SECURITY: "Security",
  MARKETING: "Marketing",
  SYSTEM: "System",
};

// Permission types for each module
export type Permission =
  // Dashboard
  | "dashboard.view"
  // Users
  | "users.view"
  | "users.edit"
  | "users.ban"
  | "users.delete"
  | "users.adjust_balance"
  | "users.impersonate"
  // KYC / Verification
  | "kyc.view"
  | "kyc.approve"
  | "kyc.reject"
  // Tasks & Boards
  | "tasks.view"
  | "tasks.create" // umbrella (legacy): grants creating any type when held
  | "tasks.edit"
  | "tasks.delete"
  // Per-task-type creation gating (checked by the admin create API)
  | "tasks.create.video"
  | "tasks.create.article"
  | "tasks.create.quiz"
  | "tasks.create.survey"
  | "tasks.create.social"
  | "tasks.create.proxy"
  | "tasks.create.offerwall"
  | "tasks.create.custom"
  | "tasks.create.appinstall"
  | "boards.view"
  | "boards.manage"
  // Submissions
  | "submissions.view"
  | "submissions.approve"
  | "submissions.reject"
  // Leaderboard
  | "leaderboards.view"
  | "leaderboards.manage"
  // Withdrawals
  | "withdrawals.view"
  | "withdrawals.process"
  | "withdrawals.approve"
  | "withdrawals.reject"
  // Payment methods
  | "payment_methods.view"
  | "payment_methods.manage"
  // Marketplace
  | "marketplace.view"
  | "marketplace.manage"
  | "marketplace.disputes"
  | "marketplace.mediate"
  // Packages / Subscriptions
  | "packages.view"
  | "packages.edit"
  // Referrals
  | "referrals.view"
  | "referrals.configure"
  // Finance hub (aggregate financial reporting across every money flow)
  | "finance.view"
  // Lottery
  | "lottery.view"
  | "lottery.manage"
  // Courses
  | "courses.view"
  | "courses.manage"
  | "courses.approve"
  // Tutor (separate from admin courses — own-course management)
  | "tutor.dashboard"
  | "tutor.courses.manage"
  | "tutor.applications.review"
  // Creator/seller applications review (marketplace/advertiser/agency/affiliate)
  | "creators.review"
  // Missions
  | "missions.view"
  | "missions.manage"
  | "events.view"
  | "events.manage"
  // Quizzes
  | "quizzes.view"
  | "quizzes.manage"
  // Offerwalls
  | "offerwalls.view"
  | "offerwalls.manage"
  // Fraud
  | "fraud.view"
  | "fraud.manage"
  // Proxy
  | "proxy.view"
  | "proxy.manage"
  // Moderation
  | "moderation.view"
  | "moderation.manage"
  | "social.moderate"
  | "social.post"
  | "social.promote"
  // Logs
  | "logs.view"
  // Marketing
  | "campaigns.view"
  | "campaigns.manage"
  | "notifications.view"
  | "notifications.send"
  | "banners.view"
  | "banners.manage"
  | "games.view"
  | "games.manage"
  | "offers.view"
  | "offers.manage"
  | "ads.view"
  | "ads.manage"
  | "landing.view"
  | "landing.edit"
  | "ticker.view"
  | "ticker.edit"
  // Analytics
  | "analytics.view"
  | "analytics.export"
  // AI
  | "ai.view"
  | "ai.manage"
  // Settings
  | "settings.view"
  | "settings.edit"
  // Admin control
  | "admins.view"
  | "admins.manage"
  // Cross-admin audit feed (super-admin only)
  | "admin.activity"
  // Media
  | "media.view"
  | "media.manage";

// ── Per-task-type creation permissions ──
// Mirrors the TaskType enum in schema.prisma. `taskCreatePermFor(type)` maps a
// task type to its create permission; the admin create API checks it per type.
export const TASK_TYPES = [
  "VIDEO",
  "ARTICLE",
  "QUIZ",
  "SURVEY",
  "SOCIAL",
  "PROXY",
  "OFFERWALL",
  "CUSTOM",
  "APPINSTALL",
] as const;
export type TaskTypeName = (typeof TASK_TYPES)[number];

export function taskCreatePermFor(type: string): Permission {
  return `tasks.create.${type.toLowerCase()}` as Permission;
}

/** Every per-type create permission (stable order = TASK_TYPES). */
export const TASK_CREATE_PERMISSIONS: Permission[] =
  TASK_TYPES.map(taskCreatePermFor);

/**
 * Category-wise permission catalog — the SINGLE SOURCE OF TRUTH for the full
 * permission set. Every `Permission` appears in exactly one group. The role
 * editor, custom-role manager and per-user override modal all render straight
 * off this (`{ label, permissions[] }`), so reorganizing groups here needs no
 * component changes. `ALL_PERMISSIONS` (below) and `SUPER_ADMIN` are derived
 * from it, so a new permission added to any group flows everywhere automatically.
 */
export const PERMISSION_CATALOG: { label: string; permissions: Permission[] }[] = [
  {
    label: "Dashboard & Analytics",
    permissions: ["dashboard.view", "analytics.view", "analytics.export"],
  },
  {
    label: "Users & Accounts",
    permissions: [
      "users.view",
      "users.edit",
      "users.ban",
      "users.delete",
      "users.adjust_balance",
      "users.impersonate",
    ],
  },
  {
    label: "KYC & Verification",
    permissions: ["kyc.view", "kyc.approve", "kyc.reject"],
  },
  {
    label: "Tasks & Submissions",
    permissions: [
      "tasks.view",
      "tasks.create",
      "tasks.edit",
      "tasks.delete",
      ...TASK_CREATE_PERMISSIONS,
      "boards.view",
      "boards.manage",
      "submissions.view",
      "submissions.approve",
      "submissions.reject",
    ],
  },
  {
    label: "Courses & Tutors",
    permissions: [
      "courses.view",
      "courses.manage",
      "courses.approve",
      "tutor.dashboard",
      "tutor.courses.manage",
      "tutor.applications.review",
      "creators.review",
    ],
  },
  {
    label: "Marketplace",
    permissions: [
      "marketplace.view",
      "marketplace.manage",
      "marketplace.disputes",
      "marketplace.mediate",
    ],
  },
  {
    label: "Social & Moderation",
    permissions: [
      "social.moderate",
      "social.post",
      "social.promote",
      "moderation.view",
      "moderation.manage",
    ],
  },
  {
    label: "Engagement & Growth",
    permissions: [
      "missions.view",
      "missions.manage",
      "events.view",
      "events.manage",
      "quizzes.view",
      "quizzes.manage",
      "lottery.view",
      "lottery.manage",
      "leaderboards.view",
      "leaderboards.manage",
      "offerwalls.view",
      "offerwalls.manage",
      "games.view",
      "games.manage",
    ],
  },
  {
    label: "Finance & Wallet",
    permissions: [
      "finance.view",
      "withdrawals.view",
      "withdrawals.process",
      "withdrawals.approve",
      "withdrawals.reject",
      "payment_methods.view",
      "payment_methods.manage",
      "packages.view",
      "packages.edit",
      "referrals.view",
      "referrals.configure",
    ],
  },
  {
    label: "Marketing & Ads",
    permissions: [
      "campaigns.view",
      "campaigns.manage",
      "notifications.view",
      "notifications.send",
      "banners.view",
      "banners.manage",
      "ads.view",
      "ads.manage",
      "offers.view",
      "offers.manage",
      "landing.view",
      "landing.edit",
      "ticker.view",
      "ticker.edit",
    ],
  },
  {
    label: "System & Security",
    permissions: [
      "settings.view",
      "settings.edit",
      "ai.view",
      "ai.manage",
      "media.view",
      "media.manage",
      "logs.view",
      "fraud.view",
      "fraud.manage",
      "proxy.view",
      "proxy.manage",
      "admins.view",
      "admins.manage",
      "admin.activity",
    ],
  },
];

/** Canonical full permission set — derived from the catalog so it is always
 *  exhaustive (every permission is categorized). */
export const ALL_PERMISSIONS: Permission[] = PERMISSION_CATALOG.flatMap(
  (c) => c.permissions
);

// Permission matrix based on admin_oo.md / PROTOTYPE_ADMIN.md
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  USER: [], // No admin permissions

  TUTOR: [
    // Tutors get access to their tutor dashboard and can manage their own courses.
    // Per-course ownership is enforced at the API layer (tutorId === session.user.id).
    "tutor.dashboard",
    "tutor.courses.manage",
    "courses.view",
    "media.view",
  ],

  // Full access to EVERYTHING — derived from the catalog so it can never fall
  // out of sync as new permissions are added.
  SUPER_ADMIN: [...ALL_PERMISSIONS],

  // Generic admin — broad by default, but NEVER finance and NEVER admins.manage
  // (super admin tunes it down further via the editor; the resolver also strips
  // finance + admins.manage as a hard backstop). Custom-role users share this base.
  ADMIN: [
    "dashboard.view",
    "users.view", "users.edit", "users.ban", "users.delete", "users.adjust_balance",
    "kyc.view", "kyc.approve", "kyc.reject",
    "tasks.view", "tasks.create", "tasks.edit", "tasks.delete",
    ...TASK_CREATE_PERMISSIONS,
    "boards.view", "boards.manage",
    "submissions.view", "submissions.approve", "submissions.reject",
    "leaderboards.view", "leaderboards.manage",
    "marketplace.view", "marketplace.manage", "marketplace.disputes", "marketplace.mediate",
    "lottery.view", "lottery.manage",
    "courses.view", "courses.manage", "courses.approve",
    "tutor.applications.review",
    "creators.review",
    "missions.view", "missions.manage", "events.view", "events.manage",
    "quizzes.view", "quizzes.manage",
    "offerwalls.view", "offerwalls.manage",
    "fraud.view", "fraud.manage",
    "proxy.view", "proxy.manage",
    "moderation.view", "moderation.manage", "social.moderate", "social.post", "social.promote",
    "logs.view",
    "campaigns.view", "campaigns.manage",
    "notifications.view", "notifications.send",
    "banners.view", "banners.manage",
    "games.view", "games.manage",
    "ads.view", "ads.manage",
    "landing.view", "landing.edit",
    "ticker.view", "ticker.edit",
    "analytics.view", "analytics.export",
    "ai.view", "ai.manage",
    "settings.view", "settings.edit",
    "admins.view",
    "media.view", "media.manage",
    "offers.view", "offers.manage",
  ],

  FINANCE_ADMIN: [
    "dashboard.view",
    "finance.view",
    "users.view",
    "withdrawals.view", "withdrawals.process", "withdrawals.approve", "withdrawals.reject",
    "payment_methods.view", "payment_methods.manage",
    "packages.view", "packages.edit",
    "referrals.view", "referrals.configure",
    // Read-only visibility of every revenue source so finance can reconcile
    // income end-to-end (they manage payouts, not the content itself).
    "marketplace.view",
    "courses.view",
    "ads.view",
    "offerwalls.view",
    "analytics.view", "analytics.export",
  ],

  CONTENT_ADMIN: [
    "dashboard.view",
    "users.view",
    "tasks.view", "tasks.create", "tasks.edit",
    // Every task type (incl. app-install) — audience targeting rides along.
    ...TASK_CREATE_PERMISSIONS,
    "boards.view", "boards.manage",
    "submissions.view", "submissions.approve", "submissions.reject",
    "courses.view", "courses.manage", "courses.approve",
    "tutor.applications.review",
    "creators.review",
    "missions.view", "missions.manage", "events.view", "events.manage",
    "quizzes.view", "quizzes.manage",
    "lottery.view", "lottery.manage",
    "leaderboards.view", "leaderboards.manage",
    "notifications.view", "notifications.send",
    "media.view", "media.manage",
    "ai.view", "ai.manage",
    "offers.view", "offers.manage",
    "analytics.view",
  ],

  SUPPORT_ADMIN: [
    "dashboard.view",
    "users.view", "users.edit", "users.ban", "users.impersonate",
    "kyc.view", "kyc.approve", "kyc.reject",
    "tasks.view",
    "marketplace.view", "marketplace.disputes", "marketplace.mediate",
    "moderation.view", "moderation.manage",
  ],

  MARKETING_ADMIN: [
    "dashboard.view",
    "users.view",
    "campaigns.view", "campaigns.manage",
    "notifications.view", "notifications.send",
    "banners.view", "banners.manage",
    "games.view", "games.manage",
    "ads.view", "ads.manage",
    "landing.view", "landing.edit",
    "ticker.view", "ticker.edit",
    "analytics.view", "analytics.export",
    "referrals.view",
    "social.post", "social.promote",
    "media.view",
    "offers.view", "offers.manage",
  ],

  MODERATOR: [
    "dashboard.view",
    "tasks.view",
    "submissions.view", "submissions.approve", "submissions.reject",
    "moderation.view", "moderation.manage", "social.moderate",
  ],

  // User-side advertiser/agency console — no admin-panel permissions.
  // Its capabilities come from the feature flags granted by ROLE_FEATURES
  // (advertiser / agencyMode / createTasks), not from admin permissions.
  AGENCY: [],

  // Ad Manager admin — scoped to the Ads Manager surface + its analytics.
  AD_MANAGER: [
    "dashboard.view",
    "ads.view", "ads.manage",
    "analytics.view",
  ],
};

// ── Protected capabilities (super-admin-only, enforced everywhere) ──
// FINANCE is grantable ONLY to SUPER_ADMIN + the built-in FINANCE_ADMIN role.
// admins.manage (editing roles / custom roles / per-user overrides) is
// SUPER_ADMIN-only. `stripProtectedForRole` is the hard backstop applied in the
// effective-permission resolver so a mis-saved config/override can never leak
// these to a lower admin or custom role.
export const FINANCE_PERMISSIONS: Permission[] = [
  "finance.view",
  "withdrawals.view", "withdrawals.process", "withdrawals.approve", "withdrawals.reject",
  "payment_methods.view", "payment_methods.manage",
  "packages.view", "packages.edit",
  "referrals.view", "referrals.configure",
];
export const SUPERADMIN_ONLY_PERMISSIONS: Permission[] = ["admins.manage", "admin.activity"];

const FINANCE_SET = new Set<Permission>(FINANCE_PERMISSIONS);
const SUPERADMIN_ONLY_SET = new Set<Permission>(SUPERADMIN_ONLY_PERMISSIONS);

/** True if a permission is finance-scoped (only SUPER_ADMIN + FINANCE_ADMIN). */
export function isFinancePermission(p: Permission): boolean {
  return FINANCE_SET.has(p);
}

/**
 * Remove protected capabilities a role may never hold. SUPER_ADMIN keeps
 * everything; FINANCE_ADMIN keeps finance; everyone else loses finance +
 * admins.manage. Mutates and returns the given set.
 */
export function stripProtectedForRole(
  perms: Set<Permission>,
  role: UserRole | undefined
): Set<Permission> {
  if (role === "SUPER_ADMIN") return perms;
  for (const p of SUPERADMIN_ONLY_SET) perms.delete(p);
  if (role !== "FINANCE_ADMIN") {
    for (const p of FINANCE_SET) perms.delete(p);
  }
  return perms;
}

// `ALL_PERMISSIONS` is defined above (derived from PERMISSION_CATALOG — the
// single source of truth). This set validates stored config/overrides.
const ALL_PERMISSION_SET = new Set<Permission>(ALL_PERMISSIONS);

/** Type guard: is an arbitrary string a known Permission? */
export function isPermission(v: unknown): v is Permission {
  return typeof v === "string" && ALL_PERMISSION_SET.has(v as Permission);
}

/** Keep only real permissions and drop protected caps (finance + admins.manage).
 *  Used when creating/updating custom roles — custom roles never hold them. */
export function sanitizeCustomRolePermissions(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const set = new Set<Permission>(list.filter(isPermission) as Permission[]);
  // "ADMIN" role → strips finance + admins.manage.
  return Array.from(stripProtectedForRole(set, "ADMIN"));
}

/** Sparse per-user permission grants/denials (true = grant, false = deny). */
export type PermissionOverrides = Partial<Record<Permission, boolean>>;

/** Safely read a stored `permissionOverrides` JSON into a typed sparse map. */
export function parsePermissionOverrides(v: unknown): PermissionOverrides {
  if (!v || typeof v !== "object") return {};
  const src = v as Record<string, unknown>;
  const out: PermissionOverrides = {};
  for (const k of Object.keys(src)) {
    if (isPermission(k) && typeof src[k] === "boolean") {
      out[k] = src[k] as boolean;
    }
  }
  return out;
}

// (PERMISSION_CATALOG is defined near the top — it is the single source of truth
// for the full, categorized permission set.)

// Human-readable label + one-line description for EVERY permission, so the role
// editor / per-user override UI explains exactly what each toggle grants — a
// super-admin can grant access understanding what it does. Order mirrors
// PERMISSION_CATALOG. (Anything somehow missing falls back to a humanized key.)
export const PERMISSION_META: Partial<Record<Permission, { label: string; description: string }>> = {
  // ── Dashboard & Analytics ──
  "dashboard.view": { label: "Admin dashboard", description: "Open the main admin overview (required to enter the admin panel)." },
  "analytics.view": { label: "View analytics", description: "Open platform analytics — traffic, earnings, task and user reports." },
  "analytics.export": { label: "Export analytics", description: "Download CSV / data exports of analytics." },

  // ── Users & Accounts ──
  "users.view": { label: "View users", description: "Browse the user directory, open profiles and the User Activity feed." },
  "users.edit": { label: "Edit users", description: "Change a user's profile, role, package, verification and seller access." },
  "users.ban": { label: "Ban / unban users", description: "Suspend or restore a user account." },
  "users.delete": { label: "Delete users", description: "Permanently delete a user account (destructive)." },
  "users.adjust_balance": { label: "Adjust balances", description: "Manually add or deduct a user's points, cash, XP or level." },
  "users.impersonate": { label: "Impersonate users", description: "Log in as a user to see the app exactly as they do." },

  // ── KYC & Verification ──
  "kyc.view": { label: "View KYC", description: "See submitted ID documents and blue-badge requests." },
  "kyc.approve": { label: "Approve KYC", description: "Approve identity verification / blue badge." },
  "kyc.reject": { label: "Reject KYC", description: "Reject a KYC submission with a reason." },

  // ── Tasks & Submissions ──
  "tasks.view": { label: "View tasks", description: "See all tasks, task categories and task boards." },
  "tasks.create": { label: "Create tasks", description: "Create new tasks (umbrella — plus the per-type permissions below)." },
  "tasks.edit": { label: "Edit tasks", description: "Edit tasks, audience targeting and task-category visibility." },
  "tasks.delete": { label: "Delete tasks", description: "Delete tasks (destructive)." },
  "tasks.create.video": { label: "Create Video tasks", description: "Create video-watch tasks." },
  "tasks.create.article": { label: "Create Article tasks", description: "Create article-read tasks." },
  "tasks.create.quiz": { label: "Create Quiz tasks", description: "Create quiz tasks." },
  "tasks.create.survey": { label: "Create Survey tasks", description: "Create survey tasks." },
  "tasks.create.social": { label: "Create Social tasks", description: "Create social-engagement tasks." },
  "tasks.create.proxy": { label: "Create Proxy tasks", description: "Create geo/proxy browsing tasks." },
  "tasks.create.offerwall": { label: "Create Offerwall tasks", description: "Create offerwall tasks." },
  "tasks.create.custom": { label: "Create Custom tasks", description: "Create custom-type tasks." },
  "tasks.create.appinstall": { label: "Create App-Install tasks", description: "Create app-install-with-proof tasks." },
  "boards.view": { label: "View task boards", description: "See task boards (bundled task sets) and their progress." },
  "boards.manage": { label: "Manage task boards", description: "Create, edit and assign tasks to task boards." },
  "submissions.view": { label: "View submissions", description: "See users' task submissions and their proof." },
  "submissions.approve": { label: "Approve submissions", description: "Approve a submission and release its reward." },
  "submissions.reject": { label: "Reject submissions", description: "Reject a submission (with an optional penalty) or request a revision." },

  // ── Courses & Tutors ──
  "courses.view": { label: "View courses", description: "See the course catalog, sales and tutor earnings." },
  "courses.manage": { label: "Manage courses", description: "Edit, unpublish or remove courses and course categories." },
  "courses.approve": { label: "Approve courses", description: "Approve submitted courses for publishing." },
  "tutor.dashboard": { label: "Tutor dashboard", description: "Access the tutor console (tutor self-service)." },
  "tutor.courses.manage": { label: "Manage own courses", description: "A tutor manages their own courses (ownership enforced)." },
  "tutor.applications.review": { label: "Review tutor applications", description: "Approve or reject tutor applications." },
  "creators.review": { label: "Review creator applications", description: "Approve/reject marketplace-seller, advertiser, agency and affiliate applications." },

  // ── Marketplace ──
  "marketplace.view": { label: "View marketplace", description: "See listings, orders, sales volume, fees and the affiliate overview." },
  "marketplace.manage": { label: "Manage marketplace", description: "Moderate listings and manage marketplace settings, commission and pricing." },
  "marketplace.disputes": { label: "Marketplace disputes", description: "Review and resolve buyer/seller disputes." },
  "marketplace.mediate": { label: "Mediate escrow deals", description: "Release or refund escrowed marketplace deals." },

  // ── Social & Moderation ──
  "social.moderate": { label: "Moderate social feed", description: "Review reports and moderate posts, comments and the feed." },
  "social.post": { label: "Post as platform", description: "Create posts / announcements from the platform account." },
  "social.promote": { label: "Promote posts", description: "Boost or promote posts in the feed." },
  "moderation.view": { label: "View moderation", description: "See the moderation queue and reports." },
  "moderation.manage": { label: "Manage moderation", description: "Take moderation actions (hide/remove/warn)." },

  // ── Engagement & Growth ──
  "missions.view": { label: "View missions", description: "See daily missions and daily-task-mission setup." },
  "missions.manage": { label: "Manage missions", description: "Create and configure daily missions and task missions." },
  "events.view": { label: "View events", description: "See events / quests." },
  "events.manage": { label: "Manage events", description: "Create and configure events / quests and their rewards." },
  "quizzes.view": { label: "View quizzes", description: "See standalone published quizzes." },
  "quizzes.manage": { label: "Manage quizzes", description: "Create, edit and publish quizzes." },
  "lottery.view": { label: "View lottery", description: "See lottery draws, tickets and winners." },
  "lottery.manage": { label: "Manage lottery", description: "Create and run lottery draws." },
  "leaderboards.view": { label: "View leaderboard", description: "See the leaderboard admin." },
  "leaderboards.manage": { label: "Manage leaderboard", description: "Configure or reset leaderboards." },
  "offerwalls.view": { label: "View offerwalls", description: "See offerwall providers, offers and completions." },
  "offerwalls.manage": { label: "Manage offerwalls", description: "Configure providers, offers and payout rules." },
  "games.view": { label: "View games", description: "See the HTML5 games catalog." },
  "games.manage": { label: "Manage games", description: "Add, edit or remove games." },

  // ── Finance & Wallet ──
  "finance.view": { label: "Finance Hub", description: "Open the finance dashboard — income by source, payouts, wallet liabilities and reports." },
  "withdrawals.view": { label: "View withdrawals", description: "See users' withdrawal & deposit requests, amounts, methods and history." },
  "withdrawals.process": { label: "Process withdrawals", description: "Act on withdrawal requests and the deposits queue." },
  "withdrawals.approve": { label: "Approve withdrawals", description: "Move a request to Processing and mark it paid." },
  "withdrawals.reject": { label: "Reject withdrawals", description: "Reject a request and refund the held balance." },
  "payment_methods.view": { label: "View payment methods", description: "See the deposit/withdrawal channels (bKash, Nagad, Binance, PayPal…)." },
  "payment_methods.manage": { label: "Manage payment methods", description: "Add, edit or disable receiving accounts and gateways." },
  "packages.view": { label: "View packages", description: "See subscription tiers, pricing and revenue." },
  "packages.edit": { label: "Edit packages", description: "Change tier pricing, limits and feature toggles." },
  "referrals.view": { label: "View referrals", description: "See the referral tree, commissions and affiliate earnings." },
  "referrals.configure": { label: "Configure referrals", description: "Set commission rates, referral bonuses and rules." },

  // ── Marketing & Ads ──
  "campaigns.view": { label: "View campaigns", description: "See marketing campaigns." },
  "campaigns.manage": { label: "Manage campaigns", description: "Create and run marketing campaigns." },
  "notifications.view": { label: "View notifications", description: "See sent notifications." },
  "notifications.send": { label: "Send notifications", description: "Send push / in-app notifications to users." },
  "banners.view": { label: "View banners", description: "See banners and the splash screen." },
  "banners.manage": { label: "Manage banners", description: "Create/edit banners and the splash screen." },
  "ads.view": { label: "View ads / monetization", description: "See ad campaigns, spend, advertiser credit and the Monetization page." },
  "ads.manage": { label: "Manage ads / monetization", description: "Create/edit campaigns & placements and tune Browse-&-Earn / ad-network settings." },
  "offers.view": { label: "View offers", description: "See promotional offers." },
  "offers.manage": { label: "Manage offers", description: "Create and edit promotional offers." },
  "landing.view": { label: "View landing page", description: "See the CMS landing-page content." },
  "landing.edit": { label: "Edit landing page", description: "Edit landing-page sections and content." },
  "ticker.view": { label: "View withdrawal ticker", description: "See the live withdrawal ticker config." },
  "ticker.edit": { label: "Edit withdrawal ticker", description: "Configure the live withdrawal ticker." },

  // ── System & Security ──
  "settings.view": { label: "View settings", description: "See system settings, social-earning, feed widgets and locations." },
  "settings.edit": { label: "Edit settings", description: "Change global platform settings and configuration." },
  "ai.view": { label: "View AI content", description: "See AI content generation tools." },
  "ai.manage": { label: "Manage AI content", description: "Generate and configure AI content." },
  "media.view": { label: "View media", description: "Browse the media library." },
  "media.manage": { label: "Manage media", description: "Upload, replace or delete media." },
  "logs.view": { label: "Security logs", description: "View the audit / security log of admin actions." },
  "fraud.view": { label: "View fraud monitor", description: "See fraud events, VPN/IP flags and anti-fraud signals." },
  "fraud.manage": { label: "Manage fraud", description: "Configure anti-fraud toggles and act on fraud events." },
  "proxy.view": { label: "View proxy servers", description: "See proxy-server config for proxy tasks." },
  "proxy.manage": { label: "Manage proxy servers", description: "Add or edit proxy servers." },
  "admins.view": { label: "View admins", description: "See admin accounts, roles and the access matrix." },
  "admins.manage": { label: "Manage admins & roles", description: "Edit the role matrix, custom roles and per-user permissions (super-admin only)." },
  "admin.activity": { label: "Admin activity log", description: "See every action other admins take — grants, approvals, edits (super-admin only)." },
};

/** Turn a permission key like `withdrawals.approve` into "Withdrawals: Approve". */
function humanizePermission(p: string): string {
  return p
    .split(".")
    .map((seg) => seg.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(": ");
}

/** Friendly label for a permission (meta override, else humanized key). */
export function permissionLabel(p: string): string {
  return PERMISSION_META[p as Permission]?.label ?? humanizePermission(p);
}

/** One-line description for a permission, or null if none is defined. */
export function permissionDescription(p: string): string | null {
  return PERMISSION_META[p as Permission]?.description ?? null;
}

// Check if a role has a specific permission
export function hasPermission(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// Check if a role has any of the specified permissions
export function hasAnyPermission(role: UserRole | undefined, permissions: Permission[]): boolean {
  if (!role) return false;
  return permissions.some((p) => hasPermission(role, p));
}

// Check if a role has all of the specified permissions
export function hasAllPermissions(role: UserRole | undefined, permissions: Permission[]): boolean {
  if (!role) return false;
  return permissions.every((p) => hasPermission(role, p));
}

// Check if a user is an admin
export function isAdmin(role: UserRole | undefined): boolean {
  if (!role) return false;
  return ADMIN_ROLES.includes(role);
}

// Check if a user is a super admin
export function isSuperAdmin(role: UserRole | undefined): boolean {
  return role === "SUPER_ADMIN";
}

// Check if a user is a tutor (also true for admins via permission inheritance,
// but distinct from ADMIN_ROLES — used to decide "show the /tutor entry point").
export function isTutor(role: UserRole | undefined): boolean {
  return role === "TUTOR";
}

// Admin navigation modules with their required permissions
export interface AdminModule {
  name: string;
  href: string;
  icon: string;
  permissions: Permission[];
  category: ModuleCategory;
  badge?: string;
}

// Full 33-module admin navigation per admin_oo.md specification
export const ADMIN_MODULES: AdminModule[] = [
  // ── CORE ──
  {
    name: "Dashboard",
    href: "/admin",
    icon: "LayoutDashboard",
    permissions: ["dashboard.view"],
    category: "CORE",
  },
  {
    name: "Users",
    href: "/admin/users",
    icon: "Users",
    permissions: ["users.view"],
    category: "CORE",
  },
  {
    name: "User Activity",
    href: "/admin/user-activity",
    icon: "Activity",
    permissions: ["users.view"],
    category: "CORE",
  },
  {
    name: "Leaderboard",
    href: "/admin/leaderboard",
    icon: "Trophy",
    permissions: ["leaderboards.view"],
    category: "CORE",
  },
  {
    name: "Tasks",
    href: "/admin/tasks",
    icon: "ListTodo",
    permissions: ["tasks.view"],
    category: "CORE",
  },
  {
    name: "Task Categories",
    href: "/admin/task-categories",
    icon: "LayoutGrid",
    permissions: ["tasks.view"],
    category: "CORE",
  },
  {
    name: "Task Boards",
    href: "/admin/boards",
    icon: "Layers",
    permissions: ["boards.view"],
    category: "CORE",
  },
  {
    name: "Submissions",
    href: "/admin/submissions",
    icon: "ClipboardCheck",
    permissions: ["submissions.view"],
    category: "CORE",
  },

  // ── FINANCE ──
  {
    name: "Finance Hub",
    href: "/admin/finance",
    icon: "Landmark",
    permissions: ["finance.view"],
    category: "FINANCE",
  },
  {
    name: "Withdrawals",
    href: "/admin/withdrawals",
    icon: "Wallet",
    permissions: ["withdrawals.view"],
    category: "FINANCE",
  },
  {
    name: "Deposits",
    href: "/admin/deposits",
    icon: "Wallet",
    permissions: ["withdrawals.view"],
    category: "FINANCE",
  },
  {
    name: "Payment Methods",
    href: "/admin/payment-methods",
    icon: "CreditCard",
    permissions: ["payment_methods.view"],
    category: "FINANCE",
  },
  {
    name: "Packages",
    href: "/admin/packages",
    icon: "Package",
    permissions: ["packages.view"],
    category: "FINANCE",
  },
  {
    name: "Referrals",
    href: "/admin/referrals",
    icon: "GitBranch",
    permissions: ["referrals.view"],
    category: "FINANCE",
  },

  // ── PLATFORM ──
  {
    name: "Marketplace",
    href: "/admin/marketplace",
    icon: "Store",
    permissions: ["marketplace.view"],
    category: "PLATFORM",
  },
  {
    name: "Affiliate",
    href: "/admin/affiliate",
    icon: "Handshake",
    permissions: ["marketplace.view"],
    category: "PLATFORM",
  },
  {
    name: "Deals",
    href: "/admin/marketplace/deals",
    icon: "Scale",
    permissions: ["marketplace.mediate"],
    category: "PLATFORM",
  },
  {
    name: "Social Feed",
    href: "/admin/social-moderation",
    icon: "MessageSquare",
    permissions: ["social.moderate", "moderation.view"],
    category: "PLATFORM",
  },
  {
    name: "Lottery",
    href: "/admin/lottery",
    icon: "Ticket",
    permissions: ["lottery.view"],
    category: "PLATFORM",
  },
  {
    name: "Games",
    href: "/admin/games",
    icon: "Gamepad2",
    permissions: ["games.view"],
    category: "PLATFORM",
  },
  {
    name: "Courses",
    href: "/admin/courses",
    icon: "GraduationCap",
    permissions: ["courses.view"],
    category: "PLATFORM",
  },
  {
    name: "Course Categories",
    href: "/admin/courses/categories",
    icon: "FolderTree",
    permissions: ["courses.manage"],
    category: "PLATFORM",
  },
  {
    name: "Tutors",
    href: "/admin/tutors",
    icon: "UserCog",
    permissions: ["tutor.applications.review"],
    category: "PLATFORM",
  },
  {
    name: "Creator Applications",
    href: "/admin/creators",
    icon: "BadgeCheck",
    permissions: ["creators.review"],
    category: "PLATFORM",
  },
  {
    name: "Seller Access",
    href: "/admin/sellers",
    icon: "Store",
    permissions: ["users.edit"],
    category: "PLATFORM",
  },
  {
    name: "Daily Missions",
    href: "/admin/missions",
    icon: "Target",
    permissions: ["missions.view"],
    category: "PLATFORM",
  },
  {
    name: "Daily Task Missions",
    href: "/admin/daily-missions",
    icon: "ListChecks",
    permissions: ["missions.view"],
    category: "PLATFORM",
  },
  {
    name: "Events",
    href: "/admin/events",
    icon: "Sparkles",
    permissions: ["events.view"],
    category: "PLATFORM",
  },
  {
    name: "Quizzes",
    href: "/admin/quizzes",
    icon: "Brain",
    permissions: ["quizzes.view"],
    category: "PLATFORM",
  },
  {
    name: "Offerwalls",
    href: "/admin/offerwalls",
    icon: "Gift",
    permissions: ["offerwalls.view"],
    category: "PLATFORM",
  },

  // ── SECURITY ──
  {
    name: "Fraud Monitor",
    href: "/admin/fraud",
    icon: "ShieldAlert",
    permissions: ["fraud.view"],
    category: "SECURITY",
  },
  {
    name: "KYC / Blue Badge",
    href: "/admin/users/kyc",
    icon: "BadgeCheck",
    permissions: ["kyc.view"],
    category: "SECURITY",
  },
  {
    name: "Proxy Servers",
    href: "/admin/proxy",
    icon: "Globe",
    permissions: ["proxy.view"],
    category: "SECURITY",
  },
  {
    name: "Security Logs",
    href: "/admin/logs",
    icon: "FileText",
    permissions: ["logs.view"],
    category: "SECURITY",
  },
  {
    name: "Admin Activity",
    href: "/admin/admin-activity",
    icon: "ShieldAlert",
    permissions: ["admin.activity"],
    category: "SECURITY",
  },

  // ── MARKETING ──
  {
    name: "Campaigns",
    href: "/admin/campaigns",
    icon: "Megaphone",
    permissions: ["campaigns.view"],
    category: "MARKETING",
  },
  {
    name: "Notifications",
    href: "/admin/notifications",
    icon: "Bell",
    permissions: ["notifications.view"],
    category: "MARKETING",
  },
  {
    name: "Banners",
    href: "/admin/banners",
    icon: "Image",
    permissions: ["banners.view"],
    category: "MARKETING",
  },
  {
    name: "Offers",
    href: "/admin/offers",
    icon: "Gift",
    permissions: ["offers.view"],
    category: "MARKETING",
  },
  {
    name: "Splash Screen",
    href: "/admin/splash-screen",
    icon: "Layout",
    permissions: ["banners.view"],
    category: "MARKETING",
  },
  {
    name: "Ads Manager",
    href: "/admin/ads",
    icon: "Newspaper",
    permissions: ["ads.view"],
    category: "MARKETING",
  },
  {
    name: "Monetization",
    href: "/admin/monetization",
    icon: "DollarSign",
    permissions: ["ads.view"],
    category: "MARKETING",
  },
  {
    name: "Landing Page",
    href: "/admin/landing-page",
    icon: "Layout",
    permissions: ["landing.view"],
    category: "MARKETING",
  },
  {
    name: "Withdrawal Ticker",
    href: "/admin/ticker",
    icon: "Activity",
    permissions: ["ticker.view"],
    category: "MARKETING",
  },

  // ── SYSTEM ──
  {
    name: "Analytics",
    href: "/admin/analytics",
    icon: "BarChart3",
    permissions: ["analytics.view"],
    category: "SYSTEM",
  },
  {
    name: "AI Content",
    href: "/admin/ai",
    icon: "Sparkles",
    permissions: ["ai.view"],
    category: "SYSTEM",
  },
  {
    name: "System Settings",
    href: "/admin/settings",
    icon: "Settings",
    permissions: ["settings.view"],
    category: "SYSTEM",
  },
  {
    name: "Social Earning",
    href: "/admin/settings/social-earning",
    icon: "Sparkles",
    permissions: ["settings.view"],
    category: "SYSTEM",
  },
  {
    name: "Feed Widgets",
    href: "/admin/settings/feed-widgets",
    icon: "LayoutList",
    permissions: ["settings.view"],
    category: "SYSTEM",
  },
  {
    name: "Locations",
    href: "/admin/locations",
    icon: "Globe",
    permissions: ["settings.view"],
    category: "SYSTEM",
  },
  {
    name: "Admin Control",
    href: "/admin/access",
    icon: "Shield",
    permissions: ["admins.view"],
    category: "SYSTEM",
  },
  {
    name: "Page Visibility",
    href: "/admin/visibility",
    icon: "Eye",
    permissions: ["admins.manage"],
    category: "SYSTEM",
  },
  {
    name: "Media Library",
    href: "/admin/media",
    icon: "ImageIcon",
    permissions: ["media.view"],
    category: "SYSTEM",
  },
];

// The role's code-default permission set. For runtime-configured or per-user
// resolution, use getEffectivePermissions() from src/lib/permissions.ts and the
// *ForPerms variants below.
export function roleDefaultPermSet(role: UserRole | undefined): Set<Permission> {
  return new Set(role ? ROLE_PERMISSIONS[role] ?? [] : []);
}

const CATEGORY_ORDER: ModuleCategory[] = [
  "CORE",
  "FINANCE",
  "PLATFORM",
  "SECURITY",
  "MARKETING",
  "SYSTEM",
];

// Modules accessible given an explicit permission set (config/override-aware).
export function getAccessibleModulesForPerms(
  perms: Set<Permission>
): AdminModule[] {
  return ADMIN_MODULES.filter((module) =>
    module.permissions.some((p) => perms.has(p))
  );
}

// Modules grouped by category given an explicit permission set.
export function getGroupedModulesForPerms(
  perms: Set<Permission>
): Array<{ category: ModuleCategory; label: string; modules: AdminModule[] }> {
  const accessible = getAccessibleModulesForPerms(perms);
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    modules: accessible.filter((m) => m.category === category),
  })).filter((g) => g.modules.length > 0);
}

// The admin module that owns a given pathname (longest matching href wins, so
// /admin/marketplace/deals resolves to Deals, not Marketplace). Returns null
// when no module claims the path. Used by the central route guard.
export function moduleForPath(pathname: string): AdminModule | null {
  let best: AdminModule | null = null;
  for (const m of ADMIN_MODULES) {
    if (pathname === m.href || pathname.startsWith(m.href + "/")) {
      if (!best || m.href.length > best.href.length) best = m;
    }
  }
  return best;
}

// Role-based convenience wrappers (code defaults only — client-safe).
export function getAccessibleModules(role: UserRole | undefined): AdminModule[] {
  if (!role) return [];
  return getAccessibleModulesForPerms(roleDefaultPermSet(role));
}

export function getGroupedModules(
  role: UserRole | undefined
): Array<{ category: ModuleCategory; label: string; modules: AdminModule[] }> {
  return getGroupedModulesForPerms(roleDefaultPermSet(role));
}

// Role display names and colors
export const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bgColor: string }> = {
  USER: { label: "User", color: "text-gray-400", bgColor: "bg-gray-500/10" },
  TUTOR: { label: "Tutor", color: "text-teal-300", bgColor: "bg-teal-500/10" },
  SUPER_ADMIN: { label: "Super Admin", color: "text-purple-400", bgColor: "bg-purple-500/10" },
  ADMIN: { label: "Admin", color: "text-indigo-300", bgColor: "bg-indigo-500/10" },
  FINANCE_ADMIN: { label: "Finance Admin", color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  CONTENT_ADMIN: { label: "Content Admin", color: "text-blue-400", bgColor: "bg-blue-500/10" },
  SUPPORT_ADMIN: { label: "Support Admin", color: "text-amber-400", bgColor: "bg-amber-500/10" },
  MARKETING_ADMIN: { label: "Marketing Admin", color: "text-pink-400", bgColor: "bg-pink-500/10" },
  MODERATOR: { label: "Moderator", color: "text-cyan-400", bgColor: "bg-cyan-500/10" },
  AGENCY: { label: "Agency", color: "text-orange-300", bgColor: "bg-orange-500/10" },
  AD_MANAGER: { label: "Ad Manager", color: "text-yellow-300", bgColor: "bg-yellow-500/10" },
};
