import { usd } from "@/lib/utils";
import { parsePage } from "@/lib/paginate";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import {
  Store,
  Package,
  DollarSign,
  Eye,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Scale,
  AlertTriangle,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { CreateListingButton } from "@/components/admin/marketplace-actions";
import { DisputeResolveButton } from "@/components/admin/marketplace/dispute-resolve-button";
import { AdminTable } from "@/components/admin/ui/admin-table";
import { cn } from "@/lib/utils";
import { ASSET_TYPE_LABEL } from "@/lib/marketplace-categories";

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    status?: string;
    category?: string;
    assetType?: string;
    search?: string;
  }>;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  ACTIVE: {
    label: "Active",
    color: "text-emerald-400 bg-emerald-500/10",
    icon: CheckCircle,
  },
  SOLD: {
    label: "Sold",
    color: "text-blue-400 bg-blue-500/10",
    icon: ShoppingCart,
  },
  CANCELLED: {
    label: "Cancelled",
    color: "text-red-400 bg-red-500/10",
    icon: XCircle,
  },
  EXPIRED: {
    label: "Expired",
    color: "text-slate-400 bg-slate-500/10",
    icon: Clock,
  },
  PENDING_REVIEW: {
    label: "Pending review",
    color: "text-amber-400 bg-amber-500/10",
    icon: Clock,
  },
  REJECTED: {
    label: "Rejected",
    color: "text-rose-400 bg-rose-500/10",
    icon: XCircle,
  },
};

const PURCHASE_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  DISPUTED: "Disputed",
};

const DISPUTE_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Open", color: "text-red-400 bg-red-500/10" },
  IN_REVIEW: { label: "In Review", color: "text-amber-400 bg-amber-500/10" },
  RESOLVED_BUYER: {
    label: "Resolved (Buyer)",
    color: "text-emerald-400 bg-emerald-500/10",
  },
  RESOLVED_SELLER: {
    label: "Resolved (Seller)",
    color: "text-blue-400 bg-blue-500/10",
  },
  CLOSED: { label: "Closed", color: "text-slate-400 bg-slate-500/10" },
  ESCALATED: {
    label: "Escalated",
    color: "text-purple-400 bg-purple-500/10",
  },
};

const TABS = [
  { id: "listings", label: "Listings" },
  { id: "orders", label: "Orders" },
  { id: "disputes", label: "Disputes" },
  { id: "categories", label: "Categories" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function AdminMarketplacePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await can(session.user.id, "marketplace.view"))) redirect("/admin");

  const params = await searchParams;
  const tab: TabId = (TABS.find((t) => t.id === params.tab)?.id ??
    "listings") as TabId;
  const page = parsePage(params.page);
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const statusFilter = params.status || "";
  const categoryFilter = params.category || "";
  const assetTypeFilter = params.assetType || "";
  const searchQuery = params.search || "";

  // Stats — always fetched for the top row
  const [
    totalListings,
    activeListings,
    pendingListingReview,
    totalSales,
    pendingOrders,
    openDisputes,
    totalRevenue,
  ] = await Promise.all([
    prisma.marketplaceListing.count(),
    prisma.marketplaceListing.count({ where: { status: "ACTIVE" } }),
    prisma.marketplaceListing.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.marketplacePurchase.count(),
    prisma.marketplacePurchase.count({ where: { status: "PENDING" } }),
    prisma.marketplaceDispute.count({
      where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] } },
    }),
    prisma.marketplacePurchase.aggregate({ _sum: { amount: true } }),
  ]);

  const canManage = await can(session.user.id, "marketplace.manage");
  const canResolveDisputes = await can(session.user.id, "marketplace.disputes");

  // Per-tab data fetch
  let listings: Awaited<ReturnType<typeof fetchListings>> = {
    rows: [],
    total: 0,
    categories: [],
  };
  let orders: Awaited<ReturnType<typeof fetchOrders>> = { rows: [], total: 0 };
  let disputes: Awaited<ReturnType<typeof fetchDisputes>> = {
    rows: [],
    total: 0,
  };

  if (tab === "listings") {
    listings = await fetchListings({
      where: {
        ...(statusFilter && { status: statusFilter as never }),
        ...(categoryFilter && { category: categoryFilter }),
        ...(assetTypeFilter && { assetType: assetTypeFilter }),
        ...(searchQuery && {
          OR: [
            { title: { contains: searchQuery, mode: "insensitive" as const } },
            {
              description: { contains: searchQuery, mode: "insensitive" as const },
            },
          ],
        }),
      },
      skip,
      take: pageSize,
    });
  } else if (tab === "orders") {
    orders = await fetchOrders({
      where: statusFilter ? { status: statusFilter as never } : {},
      skip,
      take: pageSize,
    });
  } else if (tab === "disputes") {
    disputes = await fetchDisputes({
      where: statusFilter ? { status: statusFilter as never } : {},
      skip,
      take: pageSize,
    });
  } else if (tab === "categories") {
    listings = await fetchListings({ where: {}, skip: 0, take: 0 });
  }

  const total =
    tab === "listings"
      ? listings.total
      : tab === "orders"
      ? orders.total
      : tab === "disputes"
      ? disputes.total
      : 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

  type ListingRow = (typeof listings.rows)[number];
  type OrderRow = (typeof orders.rows)[number];
  type DisputeRow = (typeof disputes.rows)[number];

  const buildHref = (next: {
    tab?: TabId;
    page?: number;
    status?: string;
    assetType?: string;
  }) => {
    const sp = new URLSearchParams();
    sp.set("tab", next.tab ?? tab);
    if (next.page) sp.set("page", String(next.page));
    if (next.status !== undefined) {
      if (next.status) sp.set("status", next.status);
    } else if (statusFilter) {
      sp.set("status", statusFilter);
    }
    if (categoryFilter && (next.tab ?? tab) === "listings")
      sp.set("category", categoryFilter);
    if (next.assetType !== undefined) {
      if (next.assetType) sp.set("assetType", next.assetType);
    } else if (assetTypeFilter && (next.tab ?? tab) === "listings") {
      sp.set("assetType", assetTypeFilter);
    }
    if (searchQuery && (next.tab ?? tab) === "listings")
      sp.set("search", searchQuery);
    return `/admin/marketplace?${sp.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Marketplace Management</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Manage listings, orders, disputes, and categories
          </p>
        </div>
        <CreateListingButton canManage={canManage} />
      </div>

      {/* Stats — always visible across tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Package className="w-5 h-5" />}
          tone="blue"
          value={activeListings.toLocaleString()}
          label="Active Listings"
          extra={
            pendingListingReview > 0
              ? `${pendingListingReview} pending review`
              : undefined
          }
        />
        <StatCard
          icon={<ShoppingCart className="w-5 h-5" />}
          tone="purple"
          value={totalSales.toLocaleString()}
          label="Total Orders"
          extra={
            pendingOrders > 0 ? `${pendingOrders} pending` : undefined
          }
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          tone="red"
          value={openDisputes.toLocaleString()}
          label="Open Disputes"
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          tone="amber"
          value={usd(totalRevenue._sum.amount ?? 0)}
          label="Revenue"
          extra={`${totalListings.toLocaleString()} total listings`}
        />
      </div>

      {/* Tab Bar */}
      <div className="border-b border-slate-800 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={buildHref({ tab: t.id, page: 1, status: "" })}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px",
              tab === t.id
                ? "border-blue-500 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            )}
          >
            {t.label}
            {t.id === "disputes" && openDisputes > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs">
                {openDisputes}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* ========== LISTINGS TAB ========== */}
      {tab === "listings" && (
        <>
          {/* Search + status filter */}
          <div className="flex flex-wrap items-center gap-3">
            <form
              className="flex-1 max-w-md"
              action="/admin/marketplace"
              method="GET"
            >
              <input type="hidden" name="tab" value="listings" />
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  name="search"
                  defaultValue={searchQuery}
                  placeholder="Search title, description…"
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                {statusFilter && (
                  <input type="hidden" name="status" value={statusFilter} />
                )}
                {categoryFilter && (
                  <input type="hidden" name="category" value={categoryFilter} />
                )}
                {assetTypeFilter && (
                  <input type="hidden" name="assetType" value={assetTypeFilter} />
                )}
              </div>
            </form>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildHref({ tab: "listings", page: 1, status: "" })}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  !statusFilter
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                All
              </Link>
              {Object.entries(STATUS_CONFIG).map(([s, cfg]) => (
                <Link
                  key={s}
                  href={buildHref({ tab: "listings", page: 1, status: s })}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    statusFilter === s
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {cfg.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={buildHref({ tab: "listings", page: 1, assetType: "" })}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors ${
                  !assetTypeFilter
                    ? "bg-indigo-500/15 text-indigo-200 border-indigo-500/40"
                    : "bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600"
                }`}
              >
                All types
              </Link>
              {Object.entries(ASSET_TYPE_LABEL).map(([slug, label]) => (
                <Link
                  key={slug}
                  href={buildHref({ tab: "listings", page: 1, assetType: slug })}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors ${
                    assetTypeFilter === slug
                      ? "bg-indigo-500/15 text-indigo-200 border-indigo-500/40"
                      : "bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Listings Table */}
          <div className="glass overflow-x-auto scrollbar-thin">
            {listings.rows.length > 0 ? (
              <AdminTable<ListingRow>
                bare
                rows={listings.rows}
                getRowKey={(listing) => listing.id}
                columns={[
                  {
                    key: "listing",
                    header: "Listing",
                    primary: true,
                    cell: (listing) => (
                      <>
                        <p className="font-medium text-white truncate max-w-65 inline-flex items-center gap-1.5">
                          {listing.title}
                          {listing.isFeatured && (
                            <span title="Featured" className="text-amber-400">
                              ★
                            </span>
                          )}
                          {listing.verifiedMetrics && (
                            <span
                              title="Verified metrics"
                              className="text-[10px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            >
                              ✓
                            </span>
                          )}
                          {listing.auctionMode && (
                            <span
                              title="Auction mode"
                              className="text-[10px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                            >
                              Auction
                            </span>
                          )}
                          {listing.status === "PENDING_REVIEW" &&
                            (() => {
                              const sig = fileMetaSignal(listing.fileMeta);
                              if (!sig) return null;
                              return (
                                <span
                                  title={sig.title}
                                  className={`text-[10px] font-bold uppercase tracking-wider px-1 py-0.5 rounded border ${
                                    sig.level === "warn"
                                      ? "bg-red-500/15 text-red-300 border-red-500/30"
                                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                  }`}
                                >
                                  {sig.label}
                                </span>
                              );
                            })()}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDistanceToNow(listing.createdAt, {
                            addSuffix: true,
                          })}
                        </p>
                      </>
                    ),
                  },
                  {
                    key: "seller",
                    header: "Seller",
                    cell: (listing) => (
                      <Link
                        href={`/admin/users/${listing.seller.id}`}
                        className="text-sm text-white hover:text-indigo-400 truncate max-w-40 block"
                      >
                        {listing.seller.name || listing.seller.email}
                      </Link>
                    ),
                  },
                  {
                    key: "category",
                    header: "Category",
                    cell: (listing) => (
                      <div className="flex flex-col gap-1">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 w-fit">
                          {ASSET_TYPE_LABEL[listing.assetType] ??
                            listing.assetType}
                        </span>
                        {listing.subType && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {listing.subType}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-600">
                          {listing.category}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: "price",
                    header: "Price",
                    className: "text-white font-semibold",
                    cell: (listing) => <>{usd(listing.price)}</>,
                  },
                  {
                    key: "status",
                    header: "Status",
                    cell: (listing) => {
                      const cfg =
                        STATUS_CONFIG[listing.status] || STATUS_CONFIG.ACTIVE;
                      const StatusIcon = cfg.icon;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      );
                    },
                  },
                  {
                    key: "stats",
                    header: "Stats",
                    cell: (listing) => (
                      <div className="flex items-center gap-3 text-sm text-slate-400">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          {listing.views}
                        </span>
                        <span className="flex items-center gap-1">
                          <ShoppingCart className="w-3.5 h-3.5" />
                          {listing.purchases}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    cell: (listing) => (
                      <Link
                        href={`/admin/marketplace/${listing.id}`}
                        className="px-3 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
                      >
                        View
                      </Link>
                    ),
                  },
                ]}
              />
            ) : (
              <EmptyState icon={<Store className="w-12 h-12" />} title="No listings found" />
            )}
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              skip={skip}
              pageSize={pageSize}
              buildHref={(p) => buildHref({ page: p })}
            />
          </div>
        </>
      )}

      {/* ========== ORDERS TAB ========== */}
      {tab === "orders" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ tab: "orders", page: 1, status: "" })}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                !statusFilter
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              All
            </Link>
            {["PENDING", "PAID", "DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED", "DISPUTED"].map(
              (s) => (
                <Link
                  key={s}
                  href={buildHref({ tab: "orders", page: 1, status: s })}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    statusFilter === s
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {PURCHASE_STATUS_LABEL[s]}
                </Link>
              )
            )}
          </div>
          <div className="glass overflow-x-auto scrollbar-thin">
            {orders.rows.length > 0 ? (
              <AdminTable<OrderRow>
                bare
                rows={orders.rows}
                getRowKey={(o) => o.id}
                columns={[
                  {
                    key: "order",
                    header: "Order",
                    primary: true,
                    className: "font-mono text-xs text-slate-300",
                    cell: (o) => o.id.slice(0, 8),
                  },
                  {
                    key: "item",
                    header: "Item",
                    cell: (o) => (
                      <Link
                        href={`/admin/marketplace/${o.listingId}`}
                        className="text-white hover:text-indigo-400 truncate max-w-65 block"
                      >
                        {o.listingTitle}
                      </Link>
                    ),
                  },
                  {
                    key: "buyer",
                    header: "Buyer",
                    cell: (o) => (
                      <Link
                        href={`/admin/users/${o.buyerId}`}
                        className="text-sm text-white hover:text-indigo-400"
                      >
                        {o.buyerName || o.buyerEmail}
                      </Link>
                    ),
                  },
                  {
                    key: "amount",
                    header: "Amount",
                    className: "text-white tabular-nums",
                    cell: (o) => <>{usd(o.amount)}</>,
                  },
                  {
                    key: "status",
                    header: "Status",
                    cell: (o) => (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300">
                        {PURCHASE_STATUS_LABEL[o.status] || o.status}
                      </span>
                    ),
                  },
                  {
                    key: "date",
                    header: "Date",
                    className: "text-sm text-slate-400",
                    cell: (o) =>
                      formatDistanceToNow(o.createdAt, { addSuffix: true }),
                  },
                ]}
              />
            ) : (
              <EmptyState
                icon={<ShoppingCart className="w-12 h-12" />}
                title="No orders found"
              />
            )}
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              skip={skip}
              pageSize={pageSize}
              buildHref={(p) => buildHref({ page: p })}
            />
          </div>
        </>
      )}

      {/* ========== DISPUTES TAB ========== */}
      {tab === "disputes" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ tab: "disputes", page: 1, status: "" })}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                !statusFilter
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              All
            </Link>
            {["OPEN", "IN_REVIEW", "ESCALATED", "RESOLVED_BUYER", "RESOLVED_SELLER", "CLOSED"].map(
              (s) => (
                <Link
                  key={s}
                  href={buildHref({ tab: "disputes", page: 1, status: s })}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    statusFilter === s
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {DISPUTE_STATUS_LABEL[s]?.label ?? s}
                </Link>
              )
            )}
          </div>
          <div className="glass overflow-x-auto scrollbar-thin">
            {disputes.rows.length > 0 ? (
              <AdminTable<DisputeRow>
                bare
                rows={disputes.rows}
                getRowKey={(d) => d.id}
                columns={[
                  {
                    key: "dispute",
                    header: "Dispute",
                    primary: true,
                    cell: (d) => (
                      <>
                        <p className="text-white truncate max-w-50">
                          {d.listingTitle}
                        </p>
                        <p className="text-xs text-slate-500 font-mono">
                          #{d.id.slice(0, 8)}
                        </p>
                      </>
                    ),
                  },
                  {
                    key: "buyer",
                    header: "Buyer",
                    className: "text-sm text-slate-300 truncate max-w-30",
                    cell: (d) => d.buyerName,
                  },
                  {
                    key: "seller",
                    header: "Seller",
                    className: "text-sm text-slate-300 truncate max-w-30",
                    cell: (d) => d.sellerName,
                  },
                  {
                    key: "reason",
                    header: "Reason",
                    className: "text-sm text-slate-400 truncate max-w-40",
                    cell: (d) => d.reason,
                  },
                  {
                    key: "amount",
                    header: "Amount",
                    className: "text-white tabular-nums",
                    cell: (d) => <>{usd(d.amount)}</>,
                  },
                  {
                    key: "status",
                    header: "Status",
                    cell: (d) => {
                      const cfg = DISPUTE_STATUS_LABEL[d.status] ?? {
                        label: d.status,
                        color: "text-slate-400 bg-slate-500/10",
                      };
                      return (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}
                        >
                          {cfg.label}
                        </span>
                      );
                    },
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    cell: (d) => {
                      const isOpen = [
                        "OPEN",
                        "IN_REVIEW",
                        "ESCALATED",
                      ].includes(d.status);
                      return isOpen && canResolveDisputes ? (
                        <DisputeResolveButton
                          disputeId={d.id}
                          buyerName={d.buyerName}
                          sellerName={d.sellerName}
                          amount={d.amount}
                        />
                      ) : (
                        <Link
                          href={`/admin/marketplace?tab=disputes&id=${d.id}`}
                          className="px-3 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
                        >
                          View
                        </Link>
                      );
                    },
                  },
                ]}
              />
            ) : (
              <EmptyState
                icon={<Scale className="w-12 h-12" />}
                title="No disputes"
                hint="Disputes will appear here when buyers or sellers open one"
              />
            )}
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              skip={skip}
              pageSize={pageSize}
              buildHref={(p) => buildHref({ page: p })}
            />
          </div>
        </>
      )}

      {/* ========== CATEGORIES TAB ========== */}
      {tab === "categories" && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-1">
            Categories
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Listing categories used across the marketplace. Full CRUD for
            categories ships in Phase 4.
          </p>
          {listings.categories.length === 0 ? (
            <EmptyState
              icon={<Tag className="w-12 h-12" />}
              title="No categories yet"
              hint="Categories appear here when listings are created"
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {listings.categories.map((c) => (
                <Link
                  key={c.category}
                  href={buildHref({
                    tab: "listings",
                    page: 1,
                    status: "",
                  }) + `&category=${encodeURIComponent(c.category)}`}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 hover:border-blue-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white font-medium truncate">
                      {c.category}
                    </p>
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-xs tabular-nums">
                      {c.count}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────────────

function StatCard({
  icon,
  tone,
  value,
  label,
  extra,
}: {
  icon: React.ReactNode;
  tone: "blue" | "purple" | "amber" | "red";
  value: string | number;
  label: string;
  extra?: string;
}) {
  const toneCls = {
    blue: "bg-blue-500/10 text-blue-400",
    purple: "bg-purple-500/10 text-purple-400",
    amber: "bg-amber-500/10 text-amber-400",
    red: "bg-red-500/10 text-red-400",
  }[tone];
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${toneCls}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-white tabular-nums truncate">
            {value}
          </p>
          <p className="text-sm text-slate-500 truncate">{label}</p>
          {extra && (
            <p className="text-xs text-slate-600 mt-0.5 truncate">{extra}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="p-16 text-center">
      <div className="text-slate-600 mx-auto mb-4 inline-block">{icon}</div>
      <h3 className="text-lg font-medium text-white mb-1">{title}</h3>
      {hint && <p className="text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  skip,
  pageSize,
  buildHref,
}: {
  page: number;
  totalPages: number;
  total: number;
  skip: number;
  pageSize: number;
  buildHref: (p: number) => string;
}) {
  if (total === 0 || totalPages <= 1) return null;
  return (
    <div className="p-4 border-t border-slate-800 flex items-center justify-between">
      <p className="text-sm text-slate-500">
        Showing {skip + 1}–{Math.min(skip + pageSize, total)} of {total}
      </p>
      <div className="flex gap-2">
        <Link
          href={page > 1 ? buildHref(page - 1) : "#"}
          className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
            page > 1
              ? "bg-slate-800 text-white hover:bg-slate-700"
              : "bg-slate-800/50 text-slate-600 cursor-not-allowed"
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </Link>
        <Link
          href={page < totalPages ? buildHref(page + 1) : "#"}
          className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
            page < totalPages
              ? "bg-slate-800 text-white hover:bg-slate-700"
              : "bg-slate-800/50 text-slate-600 cursor-not-allowed"
          }`}
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

// ─── Data fetchers ────────────────────────────────────────────────

/**
 * Derive a quick triage badge from a listing's captured file micro-metadata.
 * "warn" when the deliverable looks non-original (near-duplicate of another
 * listing, re-encoded, or carries editor/converter metadata); "ok" otherwise.
 * The full breakdown stays on the listing detail's FileMetaPanel.
 */
function fileMetaSignal(
  fileMeta: unknown
): { level: "warn" | "ok"; label: string; title: string } | null {
  if (!fileMeta || typeof fileMeta !== "object") return null;
  const hints = (fileMeta as { hints?: Record<string, unknown> }).hints;
  if (!hints || typeof hints !== "object") return null;
  const dup = !!(hints as { duplicateOf?: unknown }).duplicateOf;
  const reEncoded = (hints as { reEncoded?: unknown }).reEncoded === true;
  const edited =
    (hints as { hasEditorSoftwareTag?: unknown }).hasEditorSoftwareTag === true;
  if (dup || reEncoded || edited) {
    const reasons = [
      dup && "near-duplicate of another listing",
      reEncoded && "re-encoded",
      edited && "editor/converter metadata",
    ]
      .filter(Boolean)
      .join(", ");
    return { level: "warn", label: "⚠ check", title: `Originality flags: ${reasons}` };
  }
  return {
    level: "ok",
    label: "✓ clean",
    title: "No originality red flags in file metadata",
  };
}

async function fetchListings({
  where,
  skip,
  take,
}: {
  where: Record<string, unknown>;
  skip: number;
  take: number;
}) {
  const [listings, total, categoriesRaw] = await Promise.all([
    take > 0
      ? prisma.marketplaceListing.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take,
          include: {
            seller: {
              select: { id: true, name: true, email: true, avatar: true },
            },
            _count: { select: { purchases: true } },
          },
        })
      : Promise.resolve([]),
    take > 0 ? prisma.marketplaceListing.count({ where }) : Promise.resolve(0),
    prisma.marketplaceListing.groupBy({
      by: ["category"],
      _count: { id: true },
    }),
  ]);

  type Row = {
    id: string;
    title: string;
    category: string;
    assetType: string;
    subType: string | null;
    price: number;
    status: string;
    views: number;
    createdAt: Date;
    purchases: number;
    isFeatured: boolean;
    verifiedMetrics: boolean;
    auctionMode: boolean;
    fileMeta: unknown;
    seller: { id: string; name: string | null; email: string };
  };

  const rows: Row[] = (
    listings as unknown as Array<{
      id: string;
      title: string;
      category: string;
      assetType: string;
      subType: string | null;
      price: number;
      status: string;
      views: number;
      createdAt: Date;
      isFeatured: boolean;
      verifiedMetrics: boolean;
      auctionMode: boolean;
      fileMeta: unknown;
      seller: { id: string; name: string | null; email: string };
      _count: { purchases: number };
    }>
  ).map((l) => ({
    id: l.id,
    title: l.title,
    category: l.category,
    assetType: l.assetType,
    subType: l.subType,
    price: l.price,
    status: l.status,
    views: l.views,
    createdAt: l.createdAt,
    purchases: l._count.purchases,
    isFeatured: l.isFeatured,
    verifiedMetrics: l.verifiedMetrics,
    auctionMode: l.auctionMode,
    fileMeta: l.fileMeta,
    seller: l.seller,
  }));

  type GroupRow = { category: string; _count: { id: number } };
  const categories = (categoriesRaw as unknown as GroupRow[])
    .map((c) => ({ category: c.category, count: c._count.id }))
    .sort((a, b) => b.count - a.count);

  return { rows, total, categories };
}

async function fetchOrders({
  where,
  skip,
  take,
}: {
  where: Record<string, unknown>;
  skip: number;
  take: number;
}) {
  const [purchasesRaw, total] = await Promise.all([
    prisma.marketplacePurchase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.marketplacePurchase.count({ where }),
  ]);

  type Purchase = {
    id: string;
    listingId: string;
    buyerId: string;
    amount: number;
    status: string;
    createdAt: Date;
  };
  const purchases = purchasesRaw as unknown as Purchase[];

  const listingIds = Array.from(new Set(purchases.map((p) => p.listingId)));
  const buyerIds = Array.from(new Set(purchases.map((p) => p.buyerId)));

  const [listings, buyers] = await Promise.all([
    listingIds.length
      ? prisma.marketplaceListing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    buyerIds.length
      ? prisma.user.findMany({
          where: { id: { in: buyerIds } },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
  ]);

  const listingMap = new Map(listings.map((l) => [l.id, l]));
  const buyerMap = new Map(buyers.map((b) => [b.id, b]));

  const rows = purchases.map((p) => ({
    id: p.id,
    listingId: p.listingId,
    listingTitle: listingMap.get(p.listingId)?.title ?? "—",
    buyerId: p.buyerId,
    buyerName: buyerMap.get(p.buyerId)?.name ?? null,
    buyerEmail: buyerMap.get(p.buyerId)?.email ?? "",
    amount: toNum(p.amount),
    status: p.status,
    createdAt: p.createdAt,
  }));

  return { rows, total };
}

async function fetchDisputes({
  where,
  skip,
  take,
}: {
  where: Record<string, unknown>;
  skip: number;
  take: number;
}) {
  const [disputesRaw, total] = await Promise.all([
    prisma.marketplaceDispute.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.marketplaceDispute.count({ where }),
  ]);

  type Dispute = {
    id: string;
    purchaseId: string;
    initiatorId: string;
    reason: string;
    status: string;
    createdAt: Date;
  };
  const disputes = disputesRaw as unknown as Dispute[];

  if (disputes.length === 0) return { rows: [], total };

  const purchaseIds = disputes.map((d) => d.purchaseId);
  const purchases = await prisma.marketplacePurchase.findMany({
    where: { id: { in: purchaseIds } },
    select: { id: true, amount: true, listingId: true, buyerId: true },
  });
  const pMap = new Map(purchases.map((p) => [p.id, p]));

  const listingIds = Array.from(
    new Set(purchases.map((p) => p.listingId))
  );
  const listings = await prisma.marketplaceListing.findMany({
    where: { id: { in: listingIds } },
    select: { id: true, title: true, sellerId: true },
  });
  const lMap = new Map(listings.map((l) => [l.id, l]));

  const userIds = Array.from(
    new Set([
      ...purchases.map((p) => p.buyerId),
      ...listings.map((l) => l.sellerId),
    ])
  );
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const uMap = new Map(users.map((u) => [u.id, u]));

  const rows = disputes.map((d) => {
    const p = pMap.get(d.purchaseId);
    const l = p ? lMap.get(p.listingId) : null;
    const buyer = p ? uMap.get(p.buyerId) : null;
    const seller = l ? uMap.get(l.sellerId) : null;
    return {
      id: d.id,
      reason: d.reason,
      status: d.status,
      createdAt: d.createdAt,
      amount: toNum(p?.amount),
      listingId: l?.id ?? "",
      listingTitle: l?.title ?? "—",
      buyerName: buyer?.name ?? buyer?.email ?? "—",
      sellerName: seller?.name ?? seller?.email ?? "—",
    };
  });

  return { rows, total };
}
