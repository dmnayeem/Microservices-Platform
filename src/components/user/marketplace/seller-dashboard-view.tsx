"use client";
import { STAT_VALUE_CLASS } from "@/components/user/primitives/stat-card";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Coins,
  ShoppingBag,
  Eye,
  Plus,
  Package,
  CircleAlert,
  CheckCircle2,
  XCircle,
  Hourglass,
  Clock,
  Pencil,
  MessageCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ListingCard } from "@/components/user/primitives/listing-card";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { PromoteButton } from "@/components/user/promotion/promote-button";
import { cn, usd } from "@/lib/utils";

export interface SellerListing {
  id: string;
  title: string;
  category: string;
  price: number;
  images: string[];
  views: number;
  status:
    | "ACTIVE"
    | "SOLD"
    | "CANCELLED"
    | "EXPIRED"
    | "PENDING_REVIEW"
    | "REJECTED";
  salesCount: number;
  totalEarned: number;
  createdAt: string;
  rejectionReason?: string | null;
  featuredUntil?: string | null;
}

/** A service order in progress (escrow funded, not yet released/refunded). */
export interface SellerOrder {
  dealId: string;
  threadId: string;
  title: string;
  status: "FUNDED" | "DELIVERED" | "DISPUTED";
  amount: number;
  tierName: string | null;
  dueAt: string | null;
  buyerName: string | null;
  orderedAt: string;
}

const ORDER_STATUS: Record<SellerOrder["status"], { label: string; cls: string }> = {
  FUNDED: { label: "In progress", cls: "bg-(--app-cta)/15 text-(--app-accent-ink) border-(--app-accent-edge)/30" },
  DELIVERED: { label: "Delivered", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  DISPUTED: { label: "Disputed", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
};

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "PENDING_REVIEW", label: "Pending" },
  { value: "ACTIVE", label: "Active" },
  { value: "REJECTED", label: "Rejected" },
  { value: "SOLD", label: "Sold" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "EXPIRED", label: "Expired" },
] as const;

type FilterKey = typeof STATUS_FILTERS[number]["value"];

interface Props {
  listings: SellerListing[];
  /** Money from completed sales still inside the platform's payout hold.
   *  Zero — and hidden — whenever the hold is switched off. */
  pendingPayout?: { amount: number; count: number; nextReleaseAt: string | null };
  /** "services" = the freelancer's own services (/services/my). */
  mode?: "products" | "services";
  /** Services: orders in progress, soonest due first. */
  orders?: SellerOrder[];
}

export function SellerDashboardView({ listings, pendingPayout, mode = "products", orders = [] }: Props) {
  const [filter, setFilter] = useState<FilterKey>("ALL");
  // Read once per mount — render must stay pure.
  const [now] = useState(() => Date.now());
  const services = mode === "services";
  const base = services ? "/services" : "/marketplace";

  const stats = useMemo(() => {
    const totalEarned = listings.reduce((sum, l) => sum + l.totalEarned, 0);
    const totalSales = listings.reduce((sum, l) => sum + l.salesCount, 0);
    const totalViews = listings.reduce((sum, l) => sum + l.views, 0);
    const activeCount = listings.filter((l) => l.status === "ACTIVE").length;
    return { totalEarned, totalSales, totalViews, activeCount };
  }, [listings]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return listings;
    return listings.filter((l) => l.status === filter);
  }, [filter, listings]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-white inline-flex items-center gap-2">
            <Package className="w-5 h-5 text-(--app-accent-ink)" />
            {services ? "My services" : "Seller Dashboard"}
          </h1>
          <p className="text-xs text-(--app-ink-3) mt-0.5">
            {services
              ? "Manage the services you offer and track orders."
              : "Manage your listings and track sales."}
          </p>
        </div>
        <Link
          href={`${base}/create`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          New
        </Link>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          icon={Coins}
          label="Earned"
          value={`${usd(stats.totalEarned)}`}
          tone="emerald"
        />
        {/* Without this a seller with the hold on sees a sale go through and
            nothing arrive, with no explanation anywhere. */}
        {pendingPayout && pendingPayout.count > 0 && (
          <StatCard
            icon={Clock}
            label="Clearing"
            value={`${usd(pendingPayout.amount)}`}
            tone="amber"
          />
        )}
        <StatCard
          icon={ShoppingBag}
          label={services ? "Orders" : "Sales"}
          value={stats.totalSales.toLocaleString()}
          tone="indigo"
        />
        <StatCard
          icon={Eye}
          label="Views"
          value={stats.totalViews.toLocaleString()}
          tone="blue"
        />
        <StatCard
          icon={CheckCircle2}
          label="Active"
          value={stats.activeCount.toLocaleString()}
          tone="amber"
        />
      </div>

      {services && orders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">Active orders ({orders.length})</h2>
          <div className="space-y-1.5">
            {orders.map((o) => {
              const due = o.dueAt ? new Date(o.dueAt) : null;
              // Late only while the work is still owed (not once delivered).
              const late = !!due && o.status === "FUNDED" && due.getTime() < now;
              return (
                <Link
                  key={o.dealId}
                  href={`/marketplace/messages/${o.threadId}`}
                  className="glass rounded-xl p-3 flex items-center gap-3 hover:border-(--app-accent-edge)/40 border border-transparent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{o.title}</p>
                    <p className="text-[11px] text-(--app-ink-3) truncate">
                      {o.tierName ? `${o.tierName} · ` : ""}
                      {usd(o.amount)}
                      {o.buyerName ? ` · ${o.buyerName}` : ""}
                    </p>
                    {due && (
                      <p className={cn("text-[11px] inline-flex items-center gap-1", late ? "text-rose-300 font-semibold" : "text-(--app-ink-2)")}>
                        <Clock className="w-3 h-3" />
                        Due {format(due, "d MMM")}
                        {o.status === "FUNDED" && ` · ${late ? "late" : formatDistanceToNow(due, { addSuffix: true })}`}
                      </p>
                    )}
                  </div>
                  <span className={cn("px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider shrink-0", ORDER_STATUS[o.status]?.cls)}>
                    {ORDER_STATUS[o.status]?.label ?? o.status}
                  </span>
                  <MessageCircle className="w-4 h-4 text-(--app-ink-3) shrink-0" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Filters */}
      <FilterChips
        value={filter}
        onChange={(v) => setFilter(v as FilterKey)}
        options={STATUS_FILTERS.map((s) => ({
          value: s.value,
          label: s.label,
          count: s.value === "ALL"
            ? listings.length
            : listings.filter((l) => l.status === s.value).length,
        }))}
      />

      {/* Listings */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={
            filter === "ALL"
              ? services ? "No services yet" : "No listings yet"
              : `No ${filter.toLowerCase()} ${services ? "services" : "listings"}`
          }
          description={
            filter === "ALL"
              ? services
                ? "Offer your first service to start getting orders."
                : "Create your first listing to start selling."
              : "Try a different filter."
          }
          action={
            filter === "ALL"
              ? services
                ? { label: "Offer a service", href: "/services/create" }
                : { label: "Create Listing", href: "/marketplace/create" }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((l) => (
            <div key={l.id} className="space-y-1.5">
              <ListingCard
                href={`${base}/${l.id}`}
                image={l.images[0]}
                title={l.title}
                price={l.price}
                unit="USD"
                category={l.category}
                badge={
                  l.status === "SOLD"
                    ? "SOLD"
                    : l.status === "CANCELLED"
                      ? "CANCELLED"
                      : l.status === "EXPIRED"
                        ? "EXPIRED"
                        : l.status === "PENDING_REVIEW"
                          ? "PENDING"
                          : l.status === "REJECTED"
                            ? "REJECTED"
                            : undefined
                }
              />
              {l.status === "PENDING_REVIEW" && (
                <p className="px-1 text-[10px] font-semibold text-amber-400">
                  ⏳ Awaiting admin review
                </p>
              )}
              {l.status === "REJECTED" && (
                <p className="px-1 text-[10px] text-rose-400">
                  <span className="font-semibold">Rejected</span>
                  {l.rejectionReason ? ` — ${l.rejectionReason}` : ""}
                </p>
              )}
              <div className="px-1 flex items-center justify-between text-[10px] text-(--app-ink-3)">
                <span className="inline-flex items-center gap-0.5">
                  <Eye className="w-2.5 h-2.5" />
                  {l.views.toLocaleString()}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-bold",
                    l.salesCount > 0 ? "text-emerald-400" : "text-(--app-glyph)"
                  )}
                >
                  {l.salesCount > 0 ? (
                    <>
                      <ShoppingBag className="w-2.5 h-2.5" />
                      {l.salesCount} · {usd(l.totalEarned)}
                    </>
                  ) : (
                    <>
                      <Hourglass className="w-2.5 h-2.5" />
                      {services ? "No orders yet" : "No sales yet"}
                    </>
                  )}
                </span>
              </div>
              {services && ["ACTIVE", "PENDING_REVIEW", "REJECTED"].includes(l.status) && (
                <Link
                  href={`/services/create?edit=${l.id}`}
                  className="mx-1 inline-flex items-center gap-1 text-[11px] font-semibold text-(--app-accent-ink) hover:underline"
                >
                  <Pencil className="w-3 h-3" />
                  Edit packages & details
                </Link>
              )}
              {l.status === "ACTIVE" && (
                <div className="px-1">
                  <PromoteButton
                    kind="listing"
                    id={l.id}
                    featuredUntil={l.featuredUntil}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  tone: "emerald" | "indigo" | "blue" | "amber";
}) {
  const tones = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    indigo: "border-(--app-accent-edge)/30 bg-(--app-cta)/10 text-(--app-accent-ink)",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  } as const;
  return (
    <div
      className={cn(
        "rounded-xl border p-3 backdrop-blur-xl",
        tones[tone]
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[10px] uppercase tracking-wider font-bold opacity-90 truncate">
          {label}
        </span>
      </div>
      <p className={cn(STAT_VALUE_CLASS, "mt-1")}>{value}</p>
    </div>
  );
}

// Avoid noisy unused-import warnings for icons reserved for future use
void CircleAlert;
void XCircle;
