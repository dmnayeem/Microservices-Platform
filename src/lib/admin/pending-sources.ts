import type { Permission } from "@/lib/rbac";

/**
 * Pure metadata for the admin "pending requests" registry — NO prisma, NO
 * `server-only`, so it's safe to import from client/component code (the
 * dashboard hub). The actual DB counting lives in the server-only
 * `pending-counts.ts`, which builds on this.
 */

export type PendingGroup =
  | "identity"
  | "finance"
  | "tasks"
  | "creators"
  | "marketplace"
  | "content";

export const PENDING_GROUP_LABELS: Record<PendingGroup, string> = {
  identity: "Identity",
  finance: "Finance",
  tasks: "Tasks",
  creators: "Creators",
  marketplace: "Marketplace",
  content: "Content",
};

export interface PendingSourceMeta {
  key: string;
  group: PendingGroup;
  label: string;
  /** lucide icon name — resolved to a component on the client. */
  icon: string;
  /** StatCard-style tone token. */
  tone: string;
  /** RBAC permission that gates visibility of this row. */
  permission: Permission;
  /** Where the dashboard tile links (the review page). */
  href: string;
  /** Which sidebar module the badge count attaches to. */
  moduleHref: string;
}

export type PendingSource = PendingSourceMeta & { count: number };

/** Display + routing metadata for every reviewable source (order = display order). */
export const PENDING_SOURCES: PendingSourceMeta[] = [
  // Identity
  { key: "kyc", group: "identity", label: "KYC Submissions", icon: "ShieldCheck", tone: "indigo", permission: "kyc.view", href: "/admin/users/kyc", moduleHref: "/admin/users" },
  { key: "kycAppeals", group: "identity", label: "KYC Appeals", icon: "FileWarning", tone: "amber", permission: "kyc.view", href: "/admin/users/kyc", moduleHref: "/admin/users" },
  // Finance
  { key: "withdrawals", group: "finance", label: "Withdrawals", icon: "Wallet", tone: "green", permission: "withdrawals.view", href: "/admin/withdrawals", moduleHref: "/admin/withdrawals" },
  { key: "deposits", group: "finance", label: "Deposits", icon: "ArrowDownToLine", tone: "green", permission: "withdrawals.view", href: "/admin/deposits", moduleHref: "/admin/deposits" },
  { key: "offerwallCompletions", group: "finance", label: "Offerwall Reviews", icon: "Gift", tone: "orange", permission: "offerwalls.view", href: "/admin/offerwalls", moduleHref: "/admin/offerwalls" },
  { key: "offerwallCallbacks", group: "finance", label: "Offerwall Callbacks", icon: "Gift", tone: "orange", permission: "offerwalls.view", href: "/admin/offerwall-callbacks", moduleHref: "/admin/offerwalls" },
  // Tasks
  { key: "submissions", group: "tasks", label: "Task Submissions", icon: "ClipboardCheck", tone: "blue", permission: "submissions.view", href: "/admin/submissions", moduleHref: "/admin/submissions" },
  // Creators
  { key: "creatorApps", group: "creators", label: "Creator Applications", icon: "BadgeCheck", tone: "purple", permission: "creators.review", href: "/admin/creators", moduleHref: "/admin/creators" },
  { key: "tutorApps", group: "creators", label: "Tutor Applications", icon: "UserCog", tone: "purple", permission: "tutor.applications.review", href: "/admin/tutors", moduleHref: "/admin/tutors" },
  // Marketplace
  { key: "mktListings", group: "marketplace", label: "Listings to Review", icon: "Store", tone: "pink", permission: "marketplace.view", href: "/admin/marketplace", moduleHref: "/admin/marketplace" },
  { key: "mktOrders", group: "marketplace", label: "Pending Orders", icon: "Store", tone: "pink", permission: "marketplace.view", href: "/admin/marketplace", moduleHref: "/admin/marketplace" },
  { key: "mktDisputes", group: "marketplace", label: "Disputes", icon: "Scale", tone: "red", permission: "marketplace.disputes", href: "/admin/marketplace", moduleHref: "/admin/marketplace" },
  { key: "mktDeals", group: "marketplace", label: "Deal Mediation", icon: "Scale", tone: "red", permission: "marketplace.mediate", href: "/admin/marketplace/deals", moduleHref: "/admin/marketplace/deals" },
  // Content
  { key: "courses", group: "content", label: "Course Approvals", icon: "GraduationCap", tone: "blue", permission: "courses.view", href: "/admin/courses", moduleHref: "/admin/courses" },
  { key: "courseRefunds", group: "content", label: "Course Refunds", icon: "GraduationCap", tone: "amber", permission: "courses.manage", href: "/admin/courses/refunds", moduleHref: "/admin/courses" },
  { key: "socialReports", group: "content", label: "Social Reports", icon: "Flag", tone: "red", permission: "social.moderate", href: "/admin/social-moderation", moduleHref: "/admin/social-moderation" },
];

/** Registry filtered to what this admin may see. */
export function pendingSourcesFor(perms: Set<Permission>): PendingSourceMeta[] {
  return PENDING_SOURCES.filter((s) => perms.has(s.permission));
}
