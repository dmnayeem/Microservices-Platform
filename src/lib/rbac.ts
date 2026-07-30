// RBAC (Role-Based Access Control) Configuration
// Based on admin_oo.md specification (33 modules across 6 categories)

// Note: We define UserRole locally for client components
// This should match the enum in prisma/schema.prisma
export type UserRole =
  | "USER"
  | "TUTOR"
  | "SUPER_ADMIN"
  | "FINANCE_ADMIN"
  | "CONTENT_ADMIN"
  | "SUPPORT_ADMIN"
  | "MARKETING_ADMIN"
  | "MODERATOR";

// Admin roles that have access to admin panel
export const ADMIN_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "FINANCE_ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "MARKETING_ADMIN",
  "MODERATOR",
];

// String array version for client components
export const ADMIN_ROLE_STRINGS = [
  "SUPER_ADMIN",
  "FINANCE_ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "MARKETING_ADMIN",
  "MODERATOR",
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
  | "tasks.create"
  | "tasks.edit"
  | "tasks.delete"
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
  // Packages / Subscriptions
  | "packages.view"
  | "packages.edit"
  // Referrals
  | "referrals.view"
  | "referrals.configure"
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
    "boards.view", "boards.manage",
    "submissions.view", "submissions.approve", "submissions.reject",
    "leaderboards.view", "leaderboards.manage",
    "withdrawals.view", "withdrawals.process", "withdrawals.approve", "withdrawals.reject",
    "payment_methods.view", "payment_methods.manage",
    "marketplace.view", "marketplace.manage", "marketplace.disputes",
    "packages.view", "packages.edit",
    "referrals.view", "referrals.configure",
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

  FINANCE_ADMIN: [
    "dashboard.view",
    "users.view",
    "withdrawals.view", "withdrawals.process", "withdrawals.approve", "withdrawals.reject",
    "payment_methods.view", "payment_methods.manage",
    "marketplace.view",
    "packages.view", "packages.edit",
    "analytics.view", "analytics.export",
  ],

  CONTENT_ADMIN: [
    "dashboard.view",
    "users.view",
    "tasks.view", "tasks.create", "tasks.edit",
    "boards.view", "boards.manage",
    "submissions.view", "submissions.approve", "submissions.reject",
    "courses.view", "courses.manage", "courses.approve",
    "tutor.applications.review",
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
    "marketplace.view", "marketplace.disputes",
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
};

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

// Get modules accessible by a role
export function getAccessibleModules(role: UserRole | undefined): AdminModule[] {
  if (!role) return [];
  return ADMIN_MODULES.filter((module) =>
    module.permissions.some((p) => hasPermission(role, p))
  );
}

// Get modules grouped by category, filtered by role
export function getGroupedModules(
  role: UserRole | undefined
): Array<{ category: ModuleCategory; label: string; modules: AdminModule[] }> {
  const accessible = getAccessibleModules(role);
  const order: ModuleCategory[] = [
    "CORE",
    "FINANCE",
    "PLATFORM",
    "SECURITY",
    "MARKETING",
    "SYSTEM",
  ];
  return order
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      modules: accessible.filter((m) => m.category === category),
    }))
    .filter((g) => g.modules.length > 0);
}

// Role display names and colors
export const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bgColor: string }> = {
  USER: { label: "User", color: "text-gray-400", bgColor: "bg-gray-500/10" },
  TUTOR: { label: "Tutor", color: "text-teal-300", bgColor: "bg-teal-500/10" },
  SUPER_ADMIN: { label: "Super Admin", color: "text-purple-400", bgColor: "bg-purple-500/10" },
  FINANCE_ADMIN: { label: "Finance Admin", color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  CONTENT_ADMIN: { label: "Content Admin", color: "text-blue-400", bgColor: "bg-blue-500/10" },
  SUPPORT_ADMIN: { label: "Support Admin", color: "text-amber-400", bgColor: "bg-amber-500/10" },
  MARKETING_ADMIN: { label: "Marketing Admin", color: "text-pink-400", bgColor: "bg-pink-500/10" },
  MODERATOR: { label: "Moderator", color: "text-cyan-400", bgColor: "bg-cyan-500/10" },
};
