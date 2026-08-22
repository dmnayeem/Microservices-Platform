import "server-only";
import { prisma } from "@/lib/prisma";
import type { Permission } from "@/lib/rbac";
import {
  PENDING_SOURCES,
  pendingSourcesFor,
  type PendingSource,
} from "@/lib/admin/pending-sources";

/**
 * Server-only counting for the admin "pending requests" registry. The pure
 * metadata (types, labels, source list) lives in `pending-sources.ts` so the
 * dashboard hub component can import it WITHOUT pulling prisma/`server-only`
 * into a client graph.
 *
 * Fail-safe by design: this runs in the shared admin layout (sidebar badges),
 * so a DB blip must degrade to zeros, never throw and blank the admin shell.
 */

// Accelerate edge cache: counts change slowly relative to page navigations, and
// these all hit indexed `status` columns — serve a ~20s cached value so the
// sidebar (rendered on every admin navigation) doesn't re-run 16 counts each time.
const CACHE = { ttl: 20, swr: 60 } as const;

/** key → count query. Keys match `PENDING_SOURCES[].key`. */
const COUNTERS: Record<string, () => Promise<number>> = {
  kyc: () => prisma.kYCDocument.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  kycAppeals: () => prisma.kYCAppeal.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  withdrawals: () =>
    prisma.withdrawal.count({
      where: { status: { in: ["PENDING", "PROCESSING"] } },
      cacheStrategy: CACHE,
    }),
  deposits: () => prisma.deposit.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  offerwallCompletions: () =>
    prisma.offerwallCompletion.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  offerwallCallbacks: () =>
    prisma.offerwallCallback.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  // `submittedAt` is the pivot: PENDING + null = still in progress, PENDING +
  // set = actually waiting on a reviewer. Without it the badge counted every
  // task anyone had merely opened.
  submissions: () =>
    prisma.taskSubmission.count({
      where: { status: "PENDING", submittedAt: { not: null } },
      cacheStrategy: CACHE,
    }),
  tasksPendingReview: () =>
    prisma.task.count({ where: { status: "PENDING_REVIEW" }, cacheStrategy: CACHE }),
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
  adsPending: () => prisma.ad.count({ where: { status: "PENDING" }, cacheStrategy: CACHE }),
  adsChangesRequested: () =>
    prisma.ad.count({ where: { status: "CHANGES_REQUESTED" }, cacheStrategy: CACHE }),
  supportMessages: () =>
    prisma.contactMessage.count({ where: { status: "NEW" }, cacheStrategy: CACHE }),
  fraudOpen: () => prisma.fraudEvent.count({ where: { status: "OPEN" }, cacheStrategy: CACHE }),
};

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
