import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { AdminTabs, pickTab } from "@/components/admin/ui/admin-tabs";
import { AD_FUND_REF, AD_POINTS_REF } from "@/lib/ad-wallet";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import { promotionItemLink, promotionPayReference, promotionReviewRequired } from "@/lib/promotion-review";
import { PromotionList, type PromotionRow } from "./promotions-client";

/**
 * Members' paid course / listing promotions (owner, 2026-10-17): approve to
 * feature the item (the featured days start then), reject with a reason to
 * refund the member in full. Decisions go through /api/admin/promotions/:id →
 * src/lib/promotion-review.ts; this page only reads.
 */
const TABS = [
  { id: "review", label: "Review queue" },
  { id: "all", label: "All promotions" },
];

const STATUSES = ["ALL", "PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
const PAGE = 50;

async function loadRows(
  where: Prisma.PromotionRequestWhereInput,
  opts: { skip?: number; take: number; oldestFirst?: boolean }
): Promise<PromotionRow[]> {
  const rows = await prisma.promotionRequest.findMany({
    where,
    orderBy: { createdAt: opts.oldestFirst ? "asc" : "desc" },
    skip: opts.skip ?? 0,
    take: opts.take,
    select: {
      id: true,
      kind: true,
      courseId: true,
      listingId: true,
      userId: true,
      packageLabel: true,
      days: true,
      itemTitle: true,
      status: true,
      rejectReason: true,
      reviewedAt: true,
      startsAt: true,
      endsAt: true,
      createdAt: true,
    },
  });
  if (rows.length === 0) return [];

  const courseIds = [...new Set(rows.map((r) => r.courseId).filter((x): x is string => !!x))];
  const listingIds = [...new Set(rows.map((r) => r.listingId).filter((x): x is string => !!x))];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const refs = rows.flatMap((r) => {
    const ref = promotionPayReference(r.kind, r.id);
    return [`${AD_POINTS_REF}${ref}`, `${AD_FUND_REF}${ref}`];
  });

  const [courses, listings, users, payments] = await Promise.all([
    courseIds.length
      ? prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, status: true, thumbnail: true },
        })
      : Promise.resolve([]),
    listingIds.length
      ? prisma.marketplaceListing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, status: true, images: true },
        })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, username: true, email: true },
    }),
    prisma.transaction.findMany({
      where: { reference: { in: refs } },
      select: { reference: true, amount: true, metadata: true },
    }),
  ]);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const listingById = new Map(listings.map((l) => [l.id, l]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const payByRef = new Map(payments.map((p) => [p.reference ?? "", p]));

  return rows.map((r) => {
    const isCourse = r.kind === "COURSE";
    const itemId = isCourse ? r.courseId : r.listingId;
    const course = r.courseId ? courseById.get(r.courseId) : undefined;
    const listing = r.listingId ? listingById.get(r.listingId) : undefined;
    const itemStatus = isCourse ? (course ? String(course.status) : null) : listing ? String(listing.status) : null;
    const ref = promotionPayReference(r.kind, r.id);
    const ptsRow = payByRef.get(`${AD_POINTS_REF}${ref}`);
    const fundRow = payByRef.get(`${AD_FUND_REF}${ref}`);
    let paid: string | null = null;
    if (ptsRow) {
      const meta = (ptsRow.metadata ?? {}) as { adPoints?: number };
      paid = `${Math.abs(Number(meta.adPoints ?? 0)).toLocaleString()} Ad Points`;
    } else if (fundRow) {
      paid = `${usd(Math.abs(toNum(fundRow.amount)))} Ad Fund`;
    }
    const u = userById.get(r.userId);
    return {
      id: r.id,
      kind: isCourse ? "Course" : "Listing",
      itemTitle: r.itemTitle,
      itemLink: itemId ? promotionItemLink(r.kind, itemId) : null,
      itemImage: isCourse ? course?.thumbnail ?? null : listing?.images?.[0] ?? null,
      itemStatus,
      itemLive: itemStatus === (isCourse ? "PUBLISHED" : "ACTIVE"),
      packageLabel: r.packageLabel,
      days: r.days,
      paid,
      status: r.status,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      startsAt: r.startsAt?.toISOString() ?? null,
      endsAt: r.endsAt?.toISOString() ?? null,
      owner: {
        id: r.userId,
        name: u?.name || u?.username || u?.email || "Unknown member",
        username: u?.username ?? null,
      },
    };
  });
}

export default async function AdminPromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "ads.manage"))) redirect("/admin");

  const sp = await searchParams;
  const tab = pickTab(TABS, sp.tab);
  const [pendingCount, reviewOn] = await Promise.all([
    prisma.promotionRequest.count({ where: { status: "PENDING" } }),
    promotionReviewRequired(),
  ]);

  let body: React.ReactNode;
  if (tab === "all") {
    const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "ALL";
    const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
    const where: Prisma.PromotionRequestWhereInput = status === "ALL" ? {} : { status };
    const real = STATUSES.filter((x) => x !== "ALL");
    const [rows, perStatus] = await Promise.all([
      loadRows(where, { skip: (page - 1) * PAGE, take: PAGE + 1 }),
      Promise.all(real.map((x) => prisma.promotionRequest.count({ where: { status: x } }))),
    ]);
    const counts: Record<string, number> = { ALL: 0 };
    real.forEach((x, i) => {
      counts[x] = perStatus[i];
      counts.ALL += perStatus[i];
    });
    body = (
      <PromotionList
        mode="all"
        rows={rows.slice(0, PAGE)}
        total={counts.ALL}
        status={status}
        statuses={[...STATUSES]}
        counts={counts}
        page={page}
        hasMore={rows.length > PAGE}
      />
    );
  } else {
    const rows = await loadRows({ status: "PENDING" }, { take: 100, oldestFirst: true });
    body = <PromotionList mode="review" rows={rows} total={pendingCount} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Promotions</h1>
        <p className="mt-1 text-sm text-slate-400">
          Members pay Ad Points (or Ad Fund) to feature their own course or marketplace listing. Nothing is featured
          until you approve it, and the featured days start at approval. Rejecting needs a reason the member will see,
          and refunds the payment in full to the balance it came from.
          {!reviewOn && (
            <span className="ml-1 font-semibold text-amber-300">
              Review is switched off in Settings, so new promotions are approved automatically.
            </span>
          )}
          {pendingCount > 0 && (
            <span className="ml-1 font-semibold text-amber-300">{pendingCount} waiting for review.</span>
          )}
        </p>
      </div>
      <AdminTabs tabs={TABS} active={tab} basePath="/admin/promotions" />
      {body}
    </div>
  );
}
