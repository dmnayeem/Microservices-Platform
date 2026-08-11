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

  SUPER_ADMIN: [
    // Full access to everything
    "dashboard.view",
    "users.view", "users.edit", "users.ban", "users.delete", "users.adjust_balance", "users.impersonate",
    "kyc.view", "kyc.approve", "kyc.reject",
    "tasks.view", "tasks.create", "tasks.edit", "tasks.delete",
    ...TASK_CREATE_PERMISSIONS,
    "boards.view", "boards.manage",
    "submissions.view", "submissions.approve", "submissions.reject",
    "leaderboards.view", "leaderboards.manage",
    "withdrawals.view", "withdrawals.process", "withdrawals.approve", "withdrawals.reject",
    "payment_methods.view", "payment_methods.manage",
    "marketplace.view", "marketplace.manage", "marketplace.disputes", "marketplace.mediate",
    "packages.view", "packages.edit",
    "referrals.view", "referrals.configure",
    "finance.view",
    "lottery.view", "lottery.manage",
    "courses.view", "courses.manage", "courses.approve",
    "tutor.dashboard", "tutor.courses.manage", "tutor.applications.review",
    "missions.view", "missions.manage",
    "quizzes.view", "quizzes.manage",
    "offerwalls.view", "offerwalls.manage",
    "fraud.view", "fraud.manage",
    "proxy.view", "proxy.manage",
    "moderation.view", "moderation.manage", "social.moderate",
    "social.post", "social.promote",
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
    "admins.view", "admins.manage",
    "media.view", "media.manage",
    "offers.view", "offers.manage",
  ],

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
    "missions.view", "missions.manage",
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
    // All types except app-install by default.
    "tasks.create.video", "tasks.create.article", "tasks.create.quiz",
    "tasks.create.survey", "tasks.create.social", "tasks.create.proxy",
    "tasks.create.offerwall", "tasks.create.custom",
    "boards.view", "boards.manage",
    "submissions.view", "submissions.approve", "submissions.reject",
    "courses.view", "courses.manage", "courses.approve",
    "tutor.applications.review",
    "creators.review",
    "missions.view", "missions.manage",
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
export const SUPERADMIN_ONLY_PERMISSIONS: Permission[] = ["admins.manage"];

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

// Runtime list of every known permission. Derived from the role matrix — since
// SUPER_ADMIN holds every permission, this stays complete automatically. Used to
// validate stored config/overrides and to render the config + per-user UIs.
export const ALL_PERMISSIONS: Permission[] = Array.from(
  new Set(Object.values(ROLE_PERMISSIONS).flat())
);
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

// Grouped permission catalog for admin UIs (role editor + per-user overrides).
// Client-safe (no server imports). Keep labels human-friendly.
export const PERMISSION_CATALOG: Array<{ label: string; permissions: Permission[] }> = [
  {
    label: "Users & KYC",
    permissions: [
      "users.view", "users.edit", "users.ban", "users.delete",
      "users.adjust_balance", "users.impersonate",
      "kyc.view", "kyc.approve", "kyc.reject",
    ],
  },
  {
    label: "Content & Earning",
    permissions: [
      "tasks.view", "tasks.create", "tasks.edit", "tasks.delete",
      ...TASK_CREATE_PERMISSIONS,
      "submissions.view", "submissions.approve", "submissions.reject",
      "boards.view", "boards.manage",
      "courses.view", "courses.manage", "courses.approve",
      "quizzes.view", "quizzes.manage",
      "missions.view", "missions.manage",
      "lottery.view", "lottery.manage",
      "leaderboards.view", "leaderboards.manage",
    ],
  },
  {
    label: "Finance",
    permissions: [
      "finance.view",
      "withdrawals.view", "withdrawals.process", "withdrawals.approve", "withdrawals.reject",
      "payment_methods.view", "payment_methods.manage",
      "packages.view", "packages.edit",
      "referrals.view", "referrals.configure",
    ],
  },
  {
    label: "Marketplace & Social",
    permissions: [
      "marketplace.view", "marketplace.manage", "marketplace.disputes", "marketplace.mediate",
      "social.moderate", "social.post", "social.promote",
      "moderation.view", "moderation.manage",
    ],
  },
  {
    label: "Marketing & Ads",
    permissions: [
      "campaigns.view", "campaigns.manage",
      "notifications.view", "notifications.send",
      "banners.view", "banners.manage",
      "ads.view", "ads.manage",
      "games.view", "games.manage",
      "offers.view", "offers.manage",
      "landing.view", "landing.edit",
      "ticker.view", "ticker.edit",
    ],
  },
  {
    label: "System & Security",
    permissions: [
      "dashboard.view",
      "analytics.view", "analytics.export",
      "ai.view", "ai.manage",
      "settings.view", "settings.edit",
      "admins.view", "admins.manage",
      "logs.view",
      "fraud.view", "fraud.manage",
      "proxy.view", "proxy.manage",
      "offerwalls.view", "offerwalls.manage",
      "media.view", "media.manage",
      "tutor.applications.review",
    "creators.review",
    ],
  },
];

// Human-readable label + one-line description per permission, so admin UIs show
// meaningful text instead of raw `font-mono` keys. Finance/commerce keys are
// fully described (that's where clarity matters most); anything omitted falls
// back to a humanized version of the key via permissionLabel().
export const PERMISSION_META: Partial<Record<Permission, { label: string; description: string }>> = {
  // Finance hub
  "finance.view": { label: "Finance Hub", description: "Open the finance dashboard — income by source, payouts, wallet liabilities, and reports." },
  // Withdrawals (payouts to users)
  "withdrawals.view": { label: "View withdrawals", description: "See users' withdrawal requests, amounts, methods and history." },
  "withdrawals.process": { label: "Process withdrawals", description: "Act on withdrawal requests (also gates the Deposits queue)." },
  "withdrawals.approve": { label: "Approve withdrawals", description: "Move a request to Processing and mark it paid." },
  "withdrawals.reject": { label: "Reject withdrawals", description: "Reject a request and refund the held balance." },
  // Deposits reuse the withdrawals keys (no separate deposit permission).
  // Payment methods
  "payment_methods.view": { label: "View payment methods", description: "See the deposit/withdrawal channels (bKash, Binance, PayPal…)." },
  "payment_methods.manage": { label: "Manage payment methods", description: "Add, edit or disable receiving accounts and gateways." },
  // Packages / subscriptions (recurring revenue)
  "packages.view": { label: "View packages", description: "See subscription tiers, pricing and revenue." },
  "packages.edit": { label: "Edit packages", description: "Change tier pricing, limits and features." },
  // Referrals / affiliate payouts
  "referrals.view": { label: "View referrals", description: "See referral tree, commissions and affiliate earnings." },
  "referrals.configure": { label: "Configure referrals", description: "Set commission rates and referral rules." },
  // Revenue-source visibility (read-only reconciliation)
  "marketplace.view": { label: "View marketplace", description: "See listings, orders, sales volume and fees." },
  "marketplace.manage": { label: "Manage marketplace", description: "Moderate listings and manage marketplace settings." },
  "marketplace.disputes": { label: "Marketplace disputes", description: "Review buyer/seller disputes." },
  "marketplace.mediate": { label: "Mediate escrow deals", description: "Release or refund escrowed marketplace deals." },
  "courses.view": { label: "View courses", description: "See course catalog, sales and tutor earnings." },
  "courses.manage": { label: "Manage courses", description: "Edit, unpublish or remove courses." },
  "courses.approve": { label: "Approve courses", description: "Approve submitted courses for publishing." },
  "ads.view": { label: "View ads", description: "See ad campaigns, spend and advertiser credit." },
  "ads.manage": { label: "Manage ads", description: "Create/edit campaigns and placements in the Ad Manager." },
  "offerwalls.view": { label: "View offerwalls", description: "See offerwall providers, offers and completions." },
  "offerwalls.manage": { label: "Manage offerwalls", description: "Configure providers, offers and payout rules." },
  // Analytics
  "analytics.view": { label: "View analytics", description: "Open platform analytics and reports." },
  "analytics.export": { label: "Export analytics", description: "Download CSV/data exports." },
  // Users
  "users.view": { label: "View users", description: "Browse the user directory and profiles." },
  "users.adjust_balance": { label: "Adjust balances", description: "Manually credit or debit a user's points/cash." },
  // Admin control
  "admins.view": { label: "View admins", description: "See admin accounts, roles and activity." },
  "admins.manage": { label: "Manage admins & roles", description: "Edit the role matrix, custom roles and per-user permissions (super-admin only)." },
  "creators.review": { label: "Review creator applications", description: "Approve/reject marketplace-seller, advertiser, agency and affiliate applications." },
  "dashboard.view": { label: "Admin dashboard", description: "Open the main admin overview." },
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
