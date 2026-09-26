// RBAC (Role-Based Access Control) Configuration
// Based on admin_oo.md specification (33 modules across 6 categories)

// Note: We define UserRole locally for client components
// This should match the enum in prisma/schema.prisma
export type UserRole =
  | "USER"
  | "TUTOR"
  | "SUPER_ADMIN"
  // Staff manager — one tier below super-admin, whose job is the other admins.
  | "MANAGER"
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
  | "AD_MANAGER"
  // Finance data entry: records expenses and reads the books. See the
  // FINANCE_MODERATOR note on ROLE_PERMISSIONS.
  | "FINANCE_MODERATOR";

// Admin roles that have access to admin panel.
// AGENCY is intentionally excluded — it is a user-side advertiser console.
export const ADMIN_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "MANAGER",
  "ADMIN",
  "FINANCE_ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "MARKETING_ADMIN",
  "MODERATOR",
  "AD_MANAGER",
  "FINANCE_MODERATOR",
];

// String array version for client components
export const ADMIN_ROLE_STRINGS = [
  "SUPER_ADMIN",
  "MANAGER",
  "ADMIN",
  "FINANCE_ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "MARKETING_ADMIN",
  "MODERATOR",
  "AD_MANAGER",
  "FINANCE_MODERATOR",
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
  // The company's own books — expenses, other income, tax paid to the
  // authority. `create` drafts an entry; `approve` marks it paid, approves or
  // voids it. Split because entering a bill and releasing money for it are the
  // two halves of every expense control that works.
  | "finance.entries.create"
  | "finance.entries.approve"
  // HR: employees, including the ones with no account here. Separate from the
  // books because salaries are the most sensitive figure in the building and a
  // data-entry clerk does not need to see what everyone earns.
  | "finance.hr.view"
  | "finance.hr.manage"
  // Categories, custom fields, recurring costs.
  | "finance.settings"
  // Create, suspend and grant access to FINANCE_MODERATOR accounts. The only
  // staff-administration power a finance admin has.
  | "finance.staff"
  // Staff payroll — salaries and commissions for employees, not for users.
  // Both live in FINANCE_PERMISSIONS, so a MANAGER can never be granted them.
  | "payroll.view"
  | "payroll.manage"
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
  // Support inbox (messages users send through the contact form)
  | "support.view"
  | "support.manage"
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
      "finance.entries.create",
      "finance.entries.approve",
      "finance.hr.view",
      "finance.hr.manage",
      "finance.settings",
      "finance.staff",
      "payroll.view",
      "payroll.manage",
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
      "support.view",
      "support.manage",
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

// ── Protected capabilities (defined here, ABOVE the matrix, because MANAGER's
// default set is derived by subtracting them rather than hand-listed) ──
// FINANCE is grantable ONLY to SUPER_ADMIN + the built-in FINANCE_ADMIN role.
// `stripProtectedForRole` (below) is the hard backstop applied in the
// effective-permission resolver so a mis-saved config/override can never leak
// these to a lower admin, a MANAGER, or a custom role.
export const FINANCE_PERMISSIONS: Permission[] = [
  "finance.view",
  "finance.entries.create", "finance.entries.approve",
  "finance.hr.view", "finance.hr.manage",
  "finance.settings",
  "finance.staff",
  "payroll.view", "payroll.manage",
  "withdrawals.view", "withdrawals.process", "withdrawals.approve", "withdrawals.reject",
  "payment_methods.view", "payment_methods.manage",
  "packages.view", "packages.edit",
  "referrals.view", "referrals.configure",
  // Adding or removing points / cash on a user by hand. It was an ADMIN
  // permission, and 260,000 points were added that way — money is money
  // whichever form it is typed into.
  "users.adjust_balance",
];

// admins.manage (editing roles / custom roles / per-user overrides) and
// admin.activity are held by SUPER_ADMIN and MANAGER only — administering the
// other staff is precisely the MANAGER's job, so it is not "super-only" any
// more; it is "super + manager". Every other role still loses both.
export const SUPERADMIN_ONLY_PERMISSIONS: Permission[] = ["admins.manage", "admin.activity"];

const FINANCE_SET = new Set<Permission>(FINANCE_PERMISSIONS);
const SUPERADMIN_ONLY_SET = new Set<Permission>(SUPERADMIN_ONLY_PERMISSIONS);

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

  /**
   * Staff manager — one tier below super-admin. Its job is the OTHER admins:
   * create them, suspend them, change their roles, tune their permissions,
   * and read the admin activity log to see what they did.
   *
   * Derived as "everything except money" rather than hand-listed, so a new
   * permission added to the catalog reaches the Manager automatically — the
   * Manager is defined by what it CANNOT touch, not by a list that rots.
   *
   * The subtraction is the whole point: a Manager has no finance permission
   * here, `stripProtectedForRole` removes any that a mis-saved role config or
   * per-user override tries to add back, and `canAdministerStaffAccount`
   * refuses to let a Manager near a FINANCE_ADMIN account. Three layers,
   * because only the last one is visible in the UI.
   */
  MANAGER: ALL_PERMISSIONS.filter((p) => !FINANCE_PERMISSIONS.includes(p)),

  // Generic admin — broad by default, but NEVER finance and NEVER admins.manage
  // (super admin tunes it down further via the editor; the resolver also strips
  // finance + admins.manage as a hard backstop). Custom-role users share this base.
  ADMIN: [
    "dashboard.view",
    "users.view", "users.edit", "users.ban", "users.delete",
    // (users.adjust_balance is finance now — granted by a super admin by name.)
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
    "support.view", "support.manage",
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
    "finance.entries.create", "finance.entries.approve",
    "finance.hr.view", "finance.hr.manage",
    "finance.settings",
    "finance.staff",
    "payroll.view", "payroll.manage",
    "users.view",
    "users.adjust_balance",
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

  /**
   * Finance data entry. Reads the books and records bills; cannot approve, pay,
   * void, configure, or see salaries.
   *
   * Its finance powers are NOT read from here at runtime — they are capped by
   * FINANCE_MODERATOR_CEILING in `stripProtectedForRole`. This list is the
   * default a fresh moderator starts with, and the role matrix may widen the
   * NON-finance part of it; the finance part only ever widens through a grant
   * from a super admin or finance admin.
   */
  FINANCE_MODERATOR: [
    "dashboard.view",
    "finance.view",
    "finance.entries.create",
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
    "support.view", "support.manage",
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

// (FINANCE_PERMISSIONS / SUPERADMIN_ONLY_PERMISSIONS are declared above the
// matrix — MANAGER's default set is ALL_PERMISSIONS minus the finance list.)

/** True if a permission is finance-scoped (only SUPER_ADMIN + FINANCE_ADMIN). */
export function isFinancePermission(p: Permission): boolean {
  return FINANCE_SET.has(p);
}

/**
 * Remove protected capabilities a role may never hold. Mutates and returns the
 * given set. This runs at the END of `getEffectivePermissions`, i.e. AFTER the
 * runtime role config and after the per-user grant/deny overrides, which is the
 * only position where it is actually a backstop rather than a suggestion.
 *
 *   SUPER_ADMIN    — keeps everything.
 *   MANAGER        — keeps staff administration (admins.manage, admin.activity),
 *                    loses finance unconditionally.
 *   FINANCE_ADMIN  — keeps finance, loses staff administration.
 *   everyone else  — loses both.
 *
 * ── The attack this is written against ──
 * A Manager must not be able to grant THEMSELVES finance access. They hold
 * `admins.manage`, so they can open the role editor and the per-user override
 * panel and tick `finance.view` / `withdrawals.approve` on their own account.
 * That write may even succeed. It changes nothing: the permission is stripped
 * here on every single resolve, so the effective set a `can()` call sees never
 * contains it. There is no ordering, no cache, and no override shape that gets
 * a finance permission into a MANAGER's effective set — the deletion is
 * unconditional and last.
 *
 * The three sibling attacks (a Manager promoting someone to FINANCE_ADMIN,
 * editing a finance admin's roles, or deleting/suspending a finance admin) are
 * about a DIFFERENT account, so they cannot be answered here — this function
 * only sees the actor. They are enforced by `canAdministerStaffAccount` /
 * `canAssignStaffRole` below, which every staff-mutating route calls.
 */
/**
 * The most a FINANCE_MODERATOR can hold without an explicit grant.
 *
 * A fixed ceiling rather than "whatever the role matrix says", because the role
 * matrix is edited by MANAGERs (`admins.manage`), and a manager must never be
 * able to widen anyone's access to money — including by editing the
 * moderator role itself.
 */
export const FINANCE_MODERATOR_CEILING: Permission[] = [
  "finance.view",
  "finance.entries.create",
];
const FINANCE_MODERATOR_CEILING_SET = new Set<Permission>(FINANCE_MODERATOR_CEILING);

/**
 * Finance permissions a super admin may grant to ANY staff member, one by one.
 * Everything finance except `finance.staff`: handing out finance access stays
 * with the super admin and the finance admin.
 */
export const GRANTABLE_FINANCE_PERMISSIONS: Permission[] = FINANCE_PERMISSIONS.filter(
  (p) => p !== "finance.staff"
);

/**
 * Finance permissions a FINANCE ADMIN may grant — and only to a
 * FINANCE_MODERATOR. Narrower than the super admin's list: a finance admin can
 * widen a clerk's desk, not create a second finance admin.
 */
export const FINANCE_ADMIN_GRANTABLE: Permission[] = [
  "finance.view",
  "finance.entries.create",
  "finance.entries.approve",
  "finance.hr.view",
];

export function stripProtectedForRole(
  perms: Set<Permission>,
  role: UserRole | undefined,
  /** `User.financeGrants` — the ONLY source of finance access for anyone who
   *  is not a super admin or finance admin. */
  financeGrants: readonly string[] = []
): Set<Permission> {
  if (role === "SUPER_ADMIN") return perms;
  // Staff administration: super admin and manager only.
  if (role !== "MANAGER") {
    for (const p of SUPERADMIN_ONLY_SET) perms.delete(p);
  }
  // Money. The finance admin keeps what its role gives it. Everyone else —
  // MANAGER included, which is that role's defining limit — holds a finance
  // permission ONLY if it was granted to them by name, in `financeGrants`,
  // which nothing but the finance-grant route writes. A mis-saved role config
  // or a per-user override can therefore never leak money access: both are
  // stripped here, and only the grant list is read back.
  //
  // Two sources, two rules:
  //  - A GRANT is an explicit decision about one person, so it is added even
  //    when their role lacks it — that is the whole point of granting.
  //  - The moderator CEILING only caps. A ceiling permission survives if the
  //    role already has it, so the role matrix can narrow a moderator but can
  //    never widen one past the ceiling.
  if (role !== "FINANCE_ADMIN") {
    const granted = new Set<string>(financeGrants);
    for (const p of FINANCE_SET) {
      const fromCeiling =
        role === "FINANCE_MODERATOR" && FINANCE_MODERATOR_CEILING_SET.has(p) && perms.has(p);
      if (granted.has(p) || fromCeiling) perms.add(p);
      else perms.delete(p);
    }
  }
  return perms;
}

// ───────────────────────── Staff administration hierarchy ─────────────────────
// Who may administer whose account. This is the target-side half of the rules
// (`stripProtectedForRole` is the actor-side half). Both API routes that mutate
// a staff account call these; nothing here is UI-only.

/**
 * Roles a MANAGER may administer and assign.
 *
 * Written as an explicit allow-list, not "everything except X". A deny-list
 * would silently admit any role added to the enum later — which is exactly how
 * a finance-adjacent role would end up manageable by a Manager six months from
 * now with nobody noticing.
 */
export const MANAGER_MANAGEABLE_ROLES: UserRole[] = [
  "USER",
  "TUTOR",
  "AGENCY",
  "ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "MARKETING_ADMIN",
  "MODERATOR",
  "AD_MANAGER",
];

const MANAGER_MANAGEABLE_SET = new Set<UserRole>(MANAGER_MANAGEABLE_ROLES);

/**
 * Roles NO Manager may touch, in either direction (as a target, or as the role
 * being assigned). Kept next to the allow-list so the reason is readable:
 *
 *   SUPER_ADMIN   — a Manager promoting someone to super admin, or editing a
 *                   super admin, is a straight privilege escalation: the
 *                   Manager would then control an account that outranks it.
 *   FINANCE_ADMIN — the owner's explicit rule. A Manager must not be able to
 *                   promote someone to finance admin, edit a finance admin's
 *                   roles, or remove a finance admin, because any of the three
 *                   is a way to end up controlling the money without ever
 *                   holding a finance permission themselves.
 *   MANAGER       — peer editing. Two Managers who can re-role each other can
 *                   demote each other, and a Manager who can create Managers
 *                   can build a majority. Only a super admin makes a Manager.
 */
export const MANAGER_FORBIDDEN_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "FINANCE_ADMIN",
  "FINANCE_MODERATOR",
  "MANAGER",
];

export type StaffActionCheck = { ok: true } | { ok: false; reason: string };

/**
 * May `actorRole` modify an account that currently holds `targetRole`?
 *
 * "Modify" is deliberately broad — role, status, password, email, balance,
 * permission overrides, deletion. Restricting only the ROLE field is the
 * classic mistake: leaving password and email writable on a higher-privileged
 * account means the attacker does not need to escalate their own role at all,
 * they just reset the finance admin's password and sign in as them.
 */
export function canAdministerStaffAccount(
  actorRole: UserRole | undefined,
  targetRole: UserRole | undefined
): StaffActionCheck {
  if (actorRole === "SUPER_ADMIN") return { ok: true };

  const target = (targetRole ?? "USER") as UserRole;

  if (actorRole === "MANAGER") {
    if (target === "FINANCE_ADMIN" || target === "FINANCE_MODERATOR") {
      return {
        ok: false,
        reason:
          "A manager cannot modify a finance account. Only a super admin or a finance admin can.",
      };
    }
    if (target === "SUPER_ADMIN") {
      return { ok: false, reason: "Only a super admin can modify a super admin account" };
    }
    if (target === "MANAGER") {
      return {
        ok: false,
        reason: "Only a super admin can modify another manager account.",
      };
    }
    return MANAGER_MANAGEABLE_SET.has(target)
      ? { ok: true }
      : { ok: false, reason: `A manager cannot modify a ${target} account.` };
  }

  // A finance admin administers exactly one kind of account: the finance
  // moderators who work for it. Not other finance admins — that would let one
  // finance admin mint another and route around the super admin — and no
  // other staff at all.
  if (actorRole === "FINANCE_ADMIN") {
    if (target === "FINANCE_MODERATOR") return { ok: true };
    return {
      ok: false,
      reason:
        target === "FINANCE_ADMIN"
          ? "Only a super admin can modify a finance admin account."
          : "A finance admin can only manage finance moderator accounts.",
    };
  }

  // Every other role: may not touch ANY staff account, only customers.
  if (isStaffRoleName(target)) {
    return {
      ok: false,
      reason: "Only a super admin or manager can modify a staff account",
    };
  }
  return { ok: true };
}

/**
 * May `actorRole` set someone's role TO `nextRole`?
 *
 * Separate from the check above because a role change has two sides and both
 * have to pass: a Manager demoting a finance admin fails the target check, and
 * a Manager promoting a plain user to finance admin fails this one.
 */
export function canAssignStaffRole(
  actorRole: UserRole | undefined,
  nextRole: UserRole | undefined
): StaffActionCheck {
  if (actorRole === "SUPER_ADMIN") return { ok: true };
  if (!nextRole) return { ok: true };

  if (actorRole === "MANAGER") {
    if (MANAGER_FORBIDDEN_ROLES.includes(nextRole)) {
      return {
        ok: false,
        reason:
          nextRole === "FINANCE_ADMIN" || nextRole === "FINANCE_MODERATOR"
            ? "A manager cannot give anyone a finance role. Only a super admin or a finance admin can."
            : `A manager cannot assign the ${nextRole} role. Only a super admin can.`,
      };
    }
    return MANAGER_MANAGEABLE_SET.has(nextRole)
      ? { ok: true }
      : { ok: false, reason: `A manager cannot assign the ${nextRole} role.` };
  }

  // A finance admin may make someone a finance moderator — and may take that
  // role away again (back to a plain user). Nothing else.
  if (actorRole === "FINANCE_ADMIN") {
    if (nextRole === "FINANCE_MODERATOR" || nextRole === "USER") return { ok: true };
    return {
      ok: false,
      reason: "A finance admin can only assign the Finance Moderator role.",
    };
  }

  if (isStaffRoleName(nextRole)) {
    return { ok: false, reason: "Only a super admin can change admin roles" };
  }
  return { ok: true };
}

/**
 * Local copy of the staff test, used only by the two functions above.
 *
 * `src/lib/staff.ts` is the AUTHORITATIVE definition and derives from
 * `ADMIN_ROLES` — but it imports from this file, so calling it here would be a
 * cycle. This reads the same `ADMIN_ROLES` array that `STAFF_ROLES` is spread
 * from, so the two cannot disagree: there is still exactly one list.
 * `scripts/verify-staff-off-leaderboard.ts` asserts that.
 */
function isStaffRoleName(role: UserRole | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
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
  "finance.entries.create": { label: "Record expenses", description: "Add bills, expenses, other income and tax payments to the company books. Entries start as Pending; recording one moves no money and approves nothing." },
  "finance.entries.approve": { label: "Approve & pay expenses", description: "Mark an entry paid, approve it, or void it. The half of expense control that releases money — keep it with fewer people than Record expenses." },
  "finance.hr.view": { label: "View employees & salaries", description: "See every employee record, including what each person is paid. The most sensitive figure in the company." },
  "finance.hr.manage": { label: "Manage employees", description: "Add, edit and offboard employees — with or without a platform account — and set their salary and payment details." },
  "finance.settings": { label: "Finance settings", description: "Expense categories, custom fields, and recurring bills such as rent, internet and servers." },
  "finance.staff": { label: "Manage finance moderators", description: "Create and suspend Finance Moderator accounts and widen what they can do. The only staff-administration power a finance admin has." },
  "payroll.view": { label: "View payroll", description: "See staff salaries, commissions earned, what is owed and what has been paid." },
  "payroll.manage": { label: "Run payroll", description: "Set salary and commission rates, and pay a staff member for a period. Every payment credits their wallet and is audited." },
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
  "support.view": { label: "View support inbox", description: "Read messages users send through the contact form." },
  "support.manage": { label: "Manage support inbox", description: "Mark support messages read or resolved." },
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
    name: "Buyers",
    href: "/admin/buyers",
    icon: "Users",
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
    name: "Company Books",
    href: "/admin/finance/company",
    icon: "BookOpenCheck",
    permissions: ["finance.view"],
    category: "FINANCE",
  },
  {
    name: "Wallet Payroll",
    href: "/admin/finance/payroll",
    icon: "BadgeDollarSign",
    permissions: ["payroll.view"],
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
    // Named for what the page is: a queue of user-reported content. "Social
    // Feed" suggested a feed browser, which it has never been.
    name: "Reported Content",
    href: "/admin/social-moderation",
    icon: "Flag",
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
  // Two DIFFERENT products. These were labelled "Daily Missions" and "Daily
  // Task Missions", which is why nobody could tell them apart.
  {
    name: "Missions",
    href: "/admin/missions",
    icon: "Rocket",
    permissions: ["missions.view"],
    category: "PLATFORM",
  },
  {
    name: "Daily Missions",
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
    name: "Quiz Games",
    href: "/admin/quizzes",
    icon: "Brain",
    permissions: ["quizzes.view"],
    category: "PLATFORM",
  },
  {
    name: "Levels & Achievements",
    href: "/admin/gamification",
    icon: "Trophy",
    permissions: ["settings.view"],
    category: "PLATFORM",
  },
  {
    name: "Offerwalls",
    href: "/admin/offerwalls",
    icon: "Gift",
    permissions: ["offerwalls.view"],
    category: "PLATFORM",
  },

  {
    name: "Support Inbox",
    href: "/admin/support",
    icon: "MessageSquare",
    permissions: ["support.view"],
    category: "CORE",
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
    name: "Broadcasts",
    href: "/admin/notifications/broadcasts",
    icon: "Send",
    permissions: ["notifications.send"],
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
    name: "Promote Products",
    href: "/admin/ads/promote",
    icon: "Megaphone",
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
    name: "Scheduler",
    href: "/admin/scheduler",
    icon: "Timer",
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
  MANAGER: { label: "Manager", color: "text-violet-300", bgColor: "bg-violet-500/10" },
  ADMIN: { label: "Admin", color: "text-indigo-300", bgColor: "bg-indigo-500/10" },
  FINANCE_ADMIN: { label: "Finance Admin", color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  FINANCE_MODERATOR: { label: "Finance Moderator", color: "text-teal-400", bgColor: "bg-teal-500/10" },
  CONTENT_ADMIN: { label: "Content Admin", color: "text-blue-400", bgColor: "bg-blue-500/10" },
  SUPPORT_ADMIN: { label: "Support Admin", color: "text-amber-400", bgColor: "bg-amber-500/10" },
  MARKETING_ADMIN: { label: "Marketing Admin", color: "text-pink-400", bgColor: "bg-pink-500/10" },
  MODERATOR: { label: "Moderator", color: "text-cyan-400", bgColor: "bg-cyan-500/10" },
  AGENCY: { label: "Agency", color: "text-orange-300", bgColor: "bg-orange-500/10" },
  AD_MANAGER: { label: "Ad Manager", color: "text-yellow-300", bgColor: "bg-yellow-500/10" },
};

/**
 * One plain-language line per role, for the unified access page.
 *
 * The owner's ask was literally "a short description on each one saying what it
 * actually does". These say what the holder can DO, and — for the two roles
 * that are constantly confused with each other — what they cannot.
 */
export const ROLE_META: Record<
  UserRole,
  { description: string; kind: "staff" | "client" }
> = {
  // Listed in the order Admin Control shows them: the line of command first
  // (Super Admin → Manager → Admin → Moderator), then the specialist roles,
  // then finance — which sits apart from that line — then the client roles.
  SUPER_ADMIN: {
    kind: "staff",
    description:
      "The owner account. Can do everything, including money, and is the only role that can create a Manager or a Finance Admin.",
  },
  MANAGER: {
    kind: "staff",
    description:
      "Second after the Super Admin. Runs the other staff: creates admins and moderators, suspends them, changes their roles and tunes their permissions. Sees task points and task income, never the company's money (revenue, deposits, withdrawals, wallets) unless a Super Admin grants finance by name. Cannot reach a Finance Admin, another Manager, or a Super Admin.",
  },
  ADMIN: {
    kind: "staff",
    description:
      "Below the Manager. Day-to-day admin — users, tasks, submissions, content. Sees task points and task income, never the company's money unless a Super Admin grants finance by name, and cannot administer other staff.",
  },
  MODERATOR: {
    kind: "staff",
    description:
      "Below the Admin. Front-line moderation: approves or rejects submissions and removes reported posts.",
  },
  CONTENT_ADMIN: {
    kind: "staff",
    description:
      "Reviews and edits what appears on the platform — tasks, courses, posts, media and the feed.",
  },
  SUPPORT_ADMIN: {
    kind: "staff",
    description:
      "Handles users and their problems: tickets, KYC, account questions and submission disputes.",
  },
  MARKETING_ADMIN: {
    kind: "staff",
    description:
      "Runs campaigns, announcements, push notifications, SEO and promotional content.",
  },
  AD_MANAGER: {
    kind: "staff",
    description:
      "Staff role for the Ads Manager. Holds ads.manage over EVERY advertiser's campaigns — it is not the role for a customer who wants to run their own ads. For that, grant the 'Run Ads (advertiser)' feature instead.",
  },
  FINANCE_ADMIN: {
    kind: "staff",
    description:
      "Separate from the Manager → Admin → Moderator line. The only role besides Super Admin that sees the money: revenue, withdrawals, deposits, payment methods, packages, referral payouts, balances, company expenses, HR and tax. Can create Finance Moderators, and no other staff.",
  },
  FINANCE_MODERATOR: {
    kind: "staff",
    description:
      "Finance data entry. Reads the books and records bills and expenses; cannot approve, pay, void, configure, or see salaries unless a super admin or finance admin grants it. Created by a super admin or a finance admin.",
  },
  AGENCY: {
    kind: "client",
    description:
      "A customer running an advertiser/agency console on the user side. Not an admin-panel role and never appears in the admin panel.",
  },
  TUTOR: {
    kind: "client",
    description:
      "A customer who sells courses. Gets a tutor dashboard for their OWN courses only.",
  },
  USER: {
    kind: "client",
    description:
      "A normal customer. Earns from tasks, and can be given extra capabilities one at a time with the user features below.",
  },
};

/** One-line description of a role, for UI. */
export function roleDescription(role: string): string {
  return ROLE_META[role as UserRole]?.description ?? "";
}
