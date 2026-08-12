import "server-only";
import { prisma } from "@/lib/prisma";
import type { Permission } from "@/lib/rbac";

/**
 * Single source of truth for "pending admin work" — every request/application a
 * user submits that an admin must review. Drives both the dashboard "Pending
 * Requests" hub and the live sidebar nav badges, so the two never drift.
 *
 * Fail-safe by design: this runs in the shared admin layout (sidebar badges), so
 * a DB blip must degrade to zeros, never throw and blank the whole admin shell.
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

// Accelerate edge cache: counts change slowly relative to page navigations, and
// these all hit indexed `status` columns — serve a ~20s cached value so the
// sidebar (rendered on every admin navigation) doesn't re-run 16 counts each time.
const CACHE = { ttl: 20, swr: 60 } as const;

/** key → count query. Kept separate from metadata so the registry stays serializable. */
const COUNTERS: Record<string, () => Promise<number>> = {
  kyc: () => prisma.kYCDocument.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  kycAppeals: () => prisma.kYCAppeal.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  withdrawals: () => prisma.withdrawal.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  deposits: () => prisma.deposit.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  offerwallCompletions: () =>
    prisma.offerwallCompletion.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  offerwallCallbacks: () =>
    prisma.offerwallCallback.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  submissions: () => prisma.taskSubmission.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  creatorApps: () => prisma.creatorApplication.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  tutorApps: () => prisma.tutorApplication.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  mktListings: () =>
    prisma.marketplaceListing.count({ where: { status: "PENDING_REVIEW" }, cacheStrategy: CACHE }),
  mktOrders: () => prisma.marketplacePurchase.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  mktDisputes: () =>
    prisma.marketplaceDispute.count({
      where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] } },
      cacheStrategy: CACHE,
    }),
  mktDeals: () =>
    prisma.marketplaceDeal.count({
      where: { OR: [{ adminMediated: true }, { status: "DISPUTED" }] },
      cacheStrategy: CACHE,
    }),
  courses: () => prisma.course.count({ where: { status: "PENDING_REVIEW" }, cacheStrategy: CACHE }),
  courseRefunds: () =>
    prisma.courseRefundRequest.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  socialReports: () => prisma.socialReport.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
};

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

/**
 * Live counts for the sources the admin may see. Fail-safe: a failed count → 0.
 * Only queries permitted sources (fewer queries + no count leakage).
 */
export async function getPendingCounts(
  perms?: Set<Permission>
): Promise<Record<string, number>> {
  const sources = perms
    ? PENDING_SOURCES.filter((s) => perms.has(s.permission))
    : PENDING_SOURCES;
  const results = await Promise.allSettled(sources.map((s) => COUNTERS[s.key]()));
  const out: Record<string, number> = {};
  sources.forEach((s, i) => {
    const r = results[i];
    out[s.key] = r.status === "fulfilled" && typeof r.value === "number" ? r.value : 0;
  });
  return out;
}

/** Resolve the permitted sources with their live counts, in display order. */
export async function getPendingSources(
  perms: Set<Permission>
): Promise<PendingSource[]> {
  const counts = await getPendingCounts(perms);
  return pendingSourcesFor(perms).map((s) => ({ ...s, count: counts[s.key] ?? 0 }));
}

/**
 * Aggregate permitted, non-zero counts onto sidebar module hrefs, so each nav
 * item shows the sum of its pending sources (e.g. KYC docs + appeals → Users).
 */
export function badgesByModule(
  counts: Record<string, number>,
  perms: Set<Permission>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of PENDING_SOURCES) {
    if (!perms.has(s.permission)) continue;
    const n = counts[s.key] ?? 0;
    if (n > 0) out[s.moduleHref] = (out[s.moduleHref] ?? 0) + n;
  }
  return out;
}
