"use client";

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
} from "lucide-react";
import { ListingCard } from "@/components/user/primitives/listing-card";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { PromoteButton } from "@/components/user/promotion/promote-button";
import { cn } from "@/lib/utils";

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
}

export function SellerDashboardView({ listings }: Props) {
  const [filter, setFilter] = useState<FilterKey>("ALL");

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
            <Package className="w-5 h-5 text-indigo-400" />
            Seller Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage your listings and track sales.
          </p>
        </div>
        <Link
          href="/marketplace/create"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold"
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
          value={`$${stats.totalEarned.toFixed(2)}`}
          tone="emerald"
        />
        <StatCard
          icon={ShoppingBag}
          label="Sales"
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
          title={filter === "ALL" ? "No listings yet" : `No ${filter.toLowerCase()} listings`}
          description={
            filter === "ALL"
              ? "Create your first listing to start selling."
              : "Try a different filter."
          }
          action={
            filter === "ALL"
              ? { label: "Create Listing", href: "/marketplace/create" }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((l) => (
            <div key={l.id} className="space-y-1.5">
              <ListingCard
                href={`/marketplace/${l.id}`}
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
              <div className="px-1 flex items-center justify-between text-[10px] text-gray-500">
                <span className="inline-flex items-center gap-0.5">
                  <Eye className="w-2.5 h-2.5" />
                  {l.views.toLocaleString()}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-bold",
                    l.salesCount > 0 ? "text-emerald-400" : "text-gray-600"
                  )}
                >
                  {l.salesCount > 0 ? (
                    <>
                      <ShoppingBag className="w-2.5 h-2.5" />
                      {l.salesCount} · ${l.totalEarned.toFixed(2)}
                    </>
                  ) : (
                    <>
                      <Hourglass className="w-2.5 h-2.5" />
                      No sales yet
                    </>
                  )}
                </span>
              </div>
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
    indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
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
      <p className="text-xl font-extrabold text-white tabular-nums mt-1">
        {value}
      </p>
    </div>
  );
}

// Avoid noisy unused-import warnings for icons reserved for future use
void CircleAlert;
void XCircle;
