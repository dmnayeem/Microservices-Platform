import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  Eye,
  Users,
  Heart,
  Gavel,
  HandCoins,
  ShoppingCart,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { ASSET_TYPE_LABEL } from "@/lib/marketplace-categories";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MarketplaceAnalyticsPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "marketplace.view"))) redirect("/admin");

  const { id } = await params;

  // We compute everything here server-side (same algorithm as the API endpoint).
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      assetType: true,
      subType: true,
      status: true,
      price: true,
      views: true,
      uniqueViewers: true,
      bidsCount: true,
      bidderCount: true,
      directPurchasesCount: true,
      auctionMode: true,
      auctionEndsAt: true,
      isFeatured: true,
      featuredUntil: true,
      isPromoted: true,
      promotedUntil: true,
      verifiedMetrics: true,
      createdAt: true,
    },
  });
  if (!listing) notFound();

  // 14-day daily view series
  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

  const [viewRows, watchCount, offerCount, purchaseCount, bidStatusBreakdownRaw, recentBidsRaw, recentOffersRaw] =
    await Promise.all([
      prisma.marketplaceListingView.findMany({
        where: { listingId: id, viewedAt: { gte: since } },
        select: { viewedAt: true },
      }),
      prisma.marketplaceWatch.count({ where: { listingId: id } }),
      prisma.marketplaceOffer.count({ where: { listingId: id } }),
      prisma.marketplacePurchase.count({ where: { listingId: id } }),
      prisma.marketplaceBid.groupBy({
        by: ["status"],
        where: { listingId: id },
        _count: { _all: true },
      }),
      prisma.marketplaceBid.findMany({
        where: { listingId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          bidder: {
            select: { id: true, name: true, username: true, avatar: true },
          },
        },
      }),
      prisma.marketplaceOffer.findMany({
        where: { listingId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          buyer: {
            select: { id: true, name: true, username: true, avatar: true },
          },
        },
      }),
    ]);

  const buckets = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const v of viewRows) {
    const key = v.viewedAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const viewsByDay = Array.from(buckets.entries()).map(([date, views]) => ({
    date,
    views,
  }));
  const maxDailyViews = Math.max(1, ...viewsByDay.map((d) => d.views));

  const bidByStatus = Object.fromEntries(
    (bidStatusBreakdownRaw as unknown as Array<{
      status: string;
      _count: { _all: number };
    }>).map((r) => [r.status, r._count._all])
  ) as Record<string, number>;

  type RecentBid = {
    id: string;
    amount: number;
    status: string;
    createdAt: Date;
    bidder: {
      id: string;
      name: string | null;
      username: string | null;
      avatar: string | null;
    };
  };
  type RecentOffer = {
    id: string;
    amount: number;
    counterAmount: number | null;
    status: string;
    createdAt: Date;
    buyer: {
      id: string;
      name: string | null;
      username: string | null;
      avatar: string | null;
    };
  };
  const recentBids = recentBidsRaw as unknown as RecentBid[];
  const recentOffers = recentOffersRaw as unknown as RecentOffer[];

  const conversionToView = listing.uniqueViewers > 0 ? 100 : 0;
  const conversionToWatch =
    listing.uniqueViewers > 0
      ? Math.round((watchCount / listing.uniqueViewers) * 1000) / 10
      : 0;
  const conversionToBid =
    listing.uniqueViewers > 0
      ? Math.round((listing.bidderCount / listing.uniqueViewers) * 1000) / 10
      : 0;
  const conversionToPurchase =
    listing.uniqueViewers > 0
      ? Math.round((purchaseCount / listing.uniqueViewers) * 1000) / 10
      : 0;

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/marketplace/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to listing
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2 flex-wrap">
            <TrendingUp className="w-6 h-6 text-indigo-400" />
            Listing analytics
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Engagement funnel for{" "}
            <strong className="text-white">{listing.title}</strong>
          </p>
          <div className="flex items-center flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              {ASSET_TYPE_LABEL[listing.assetType] ?? listing.assetType}
            </span>
            {listing.subType && (
              <span className="text-[10px] text-slate-500 font-mono">
                {listing.subType}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
              {listing.status}
            </span>
            {listing.isFeatured && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                <Sparkles className="w-2.5 h-2.5" />
                Featured
              </span>
            )}
            {listing.verifiedMetrics && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
                <ShieldCheck className="w-2.5 h-2.5" />
                Verified
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="text-slate-500 text-xs">Asking price</p>
          <p className="text-2xl font-extrabold text-white tabular-nums">
            ${listing.price.toLocaleString()}
          </p>
          {listing.auctionMode && listing.auctionEndsAt && (
            <p className="text-[11px] text-slate-500 mt-1 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(listing.auctionEndsAt) < new Date() ? "Ended" : "Ends"}{" "}
              {formatDistanceToNow(listing.auctionEndsAt, { addSuffix: true })}
            </p>
          )}
        </div>
      </div>

      {/* Funnel — top-level counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat
          icon={<Eye className="w-4 h-4" />}
          tone="indigo"
          label="Total views"
          value={listing.views.toLocaleString()}
        />
        <Stat
          icon={<Users className="w-4 h-4" />}
          tone="sky"
          label="Unique viewers"
          value={listing.uniqueViewers.toLocaleString()}
        />
        <Stat
          icon={<Heart className="w-4 h-4" />}
          tone="rose"
          label="Watching"
          value={watchCount.toLocaleString()}
          sub={`${conversionToWatch}% of viewers`}
        />
        <Stat
          icon={<Gavel className="w-4 h-4" />}
          tone="purple"
          label="Bids"
          value={`${listing.bidsCount.toLocaleString()}`}
          sub={`${listing.bidderCount} bidders · ${conversionToBid}%`}
        />
        <Stat
          icon={<HandCoins className="w-4 h-4" />}
          tone="emerald"
          label="Offers"
          value={offerCount.toLocaleString()}
        />
        <Stat
          icon={<ShoppingCart className="w-4 h-4" />}
          tone="amber"
          label="Purchases"
          value={purchaseCount.toLocaleString()}
          sub={`${conversionToPurchase}% conv.`}
        />
      </div>

      {/* Daily views chart */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-white mb-3">
          Daily views (last 14 days)
        </h3>
        <div className="flex items-end gap-1 h-32 sm:h-40">
          {viewsByDay.map((d) => {
            const heightPct = (d.views / maxDailyViews) * 100;
            return (
              <div
                key={d.date}
                className="flex-1 group relative flex items-end"
                title={`${d.date}: ${d.views} views`}
              >
                <div
                  className="w-full rounded-t bg-linear-to-t from-indigo-600 to-purple-500 hover:from-indigo-400 hover:to-purple-300 transition-colors min-h-0.5"
                  style={{ height: `${Math.max(2, heightPct)}%` }}
                />
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-white opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                  {d.views}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-mono">
          <span>{viewsByDay[0]?.date.slice(5)}</span>
          <span>{viewsByDay[viewsByDay.length - 1]?.date.slice(5)}</span>
        </div>
      </section>

      {/* Bid status breakdown */}
      {Object.keys(bidByStatus).length > 0 && (
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-4 sm:p-5">
          <h3 className="text-sm font-bold text-white mb-3 inline-flex items-center gap-2">
            <Gavel className="w-4 h-4 text-purple-400" />
            Bids by status
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            {(["ACTIVE", "OUTBID", "WON", "LOST", "CANCELLED"] as const).map(
              (s) => (
                <div
                  key={s}
                  className={cn(
                    "rounded-lg p-3 border",
                    s === "ACTIVE" &&
                      "border-amber-500/40 bg-amber-500/5 text-amber-300",
                    s === "OUTBID" &&
                      "border-slate-700 bg-slate-950 text-slate-400",
                    s === "WON" &&
                      "border-emerald-500/40 bg-emerald-500/5 text-emerald-300",
                    s === "LOST" && "border-red-500/30 bg-red-500/5 text-red-300",
                    s === "CANCELLED" &&
                      "border-slate-700 bg-slate-950 text-slate-500"
                  )}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider">
                    {s}
                  </p>
                  <p className="text-xl font-extrabold tabular-nums">
                    {(bidByStatus[s] ?? 0).toLocaleString()}
                  </p>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* Recent activity */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityCard
          icon={<Gavel className="w-4 h-4 text-purple-400" />}
          title="Recent bids"
        >
          {recentBids.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No bids yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recentBids.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-2 text-xs p-2 rounded-lg bg-slate-950 border border-slate-800"
                >
                  <Link
                    href={`/admin/users/${b.bidder.id}`}
                    className="text-slate-300 hover:text-white truncate flex-1"
                  >
                    {b.bidder.name ?? b.bidder.username ?? "Anon"}
                  </Link>
                  <span className="text-white font-bold tabular-nums">
                    ${b.amount.toLocaleString()}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded",
                      b.status === "ACTIVE" &&
                        "bg-amber-500/15 text-amber-300",
                      b.status === "OUTBID" && "bg-slate-700 text-slate-300",
                      b.status === "WON" &&
                        "bg-emerald-500/15 text-emerald-300",
                      b.status === "LOST" && "bg-red-500/10 text-red-300"
                    )}
                  >
                    {b.status}
                  </span>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
                    {formatDistanceToNow(b.createdAt, { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ActivityCard>

        <ActivityCard
          icon={<HandCoins className="w-4 h-4 text-emerald-400" />}
          title="Recent offers"
        >
          {recentOffers.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No offers yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recentOffers.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center gap-2 text-xs p-2 rounded-lg bg-slate-950 border border-slate-800"
                >
                  <Link
                    href={`/admin/users/${o.buyer.id}`}
                    className="text-slate-300 hover:text-white truncate flex-1"
                  >
                    {o.buyer.name ?? o.buyer.username ?? "Anon"}
                  </Link>
                  <span className="text-white font-bold tabular-nums">
                    ${o.amount.toLocaleString()}
                  </span>
                  {o.counterAmount != null && (
                    <span className="text-amber-300 font-mono tabular-nums">
                      → ${o.counterAmount.toLocaleString()}
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded",
                      o.status === "PENDING" &&
                        "bg-amber-500/15 text-amber-300",
                      o.status === "ACCEPTED" &&
                        "bg-emerald-500/15 text-emerald-300",
                      o.status === "REJECTED" && "bg-red-500/10 text-red-300",
                      o.status === "COUNTERED" &&
                        "bg-amber-500/15 text-amber-300",
                      o.status === "WITHDRAWN" && "bg-slate-700 text-slate-300"
                    )}
                  >
                    {o.status}
                  </span>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
                    {formatDistanceToNow(o.createdAt, { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ActivityCard>
      </section>

      <p className="text-[11px] text-slate-500">
        Listing created {format(listing.createdAt, "MMM d, yyyy")} ·{" "}
        Conversion to view {conversionToView}%
      </p>
    </div>
  );
}

function Stat({
  icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  tone: "indigo" | "sky" | "rose" | "purple" | "emerald" | "amber";
  label: string;
  value: string;
  sub?: string;
}) {
  const tones = {
    indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    sky: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    rose: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  };
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn("p-1.5 rounded-md border", tones[tone])}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
          {label}
        </span>
      </div>
      <p className="text-xl font-extrabold text-white tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ActivityCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <h3 className="text-sm font-bold text-white mb-3 inline-flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}
