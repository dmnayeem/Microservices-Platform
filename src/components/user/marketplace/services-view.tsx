"use client";
import { toast } from "@/lib/toast";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Briefcase,
  ListChecks,
  MessagesSquare,
  ShoppingCart,
  X,
} from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { getCategory, SERVICE_ASSET_TYPE } from "@/lib/marketplace-categories";
import { cn } from "@/lib/utils";
import {
  ListingCardV2,
  type MarketplaceListingRow,
} from "@/components/user/marketplace/marketplace-view";

const SERVICE_CATEGORIES = getCategory(SERVICE_ASSET_TYPE)?.subTypes ?? [];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "createdAt-desc", label: "Newest" },
  { value: "price-asc", label: "Price ↑" },
  { value: "price-desc", label: "Price ↓" },
  { value: "views-desc", label: "Most viewed" },
];

/**
 * /services — hire a freelancer. Services are marketplace listings of type
 * SERVICE, so ordering, cart, escrow deals and disputes are the marketplace's
 * own; this page only browses them on their own.
 */
export function ServicesView({ topAd }: { topAd?: React.ReactNode } = {}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("createdAt-desc");
  const [listings, setListings] = useState<MarketplaceListingRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    fetch("/api/cart")
      .then((r) => (r.ok ? r.json() : { summary: { itemCount: 0 } }))
      .then((d) => setCartCount(d.summary?.itemCount ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ assetType: SERVICE_ASSET_TYPE });
    if (category) params.set("subType", category);
    if (search) params.set("search", search);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    const [sortBy, sortOrder] = sort.split("-");
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    fetch(`/api/marketplace/listings?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setListings(d.listings ?? []);
        const next: Record<string, number> = {};
        for (const f of (d.facets?.subTypes ?? []) as Array<{ subType: string; count: number }>) {
          next[f.subType] = f.count;
        }
        setCounts(next);
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load services. Check your connection and try again.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [category, search, minPrice, maxPrice, sort]);

  const anyFilterActive = category || search || minPrice || maxPrice;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const clearAll = () => {
    setCategory("");
    setSearch("");
    setMinPrice("");
    setMaxPrice("");
  };

  return (
    <div className="space-y-4">
      {topAd ?? <AdRenderer placement="MARKETPLACE_TOP" />}
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex-1 inline-flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-(--app-accent-ink)" /> Services
          <span className="text-xs font-mono uppercase tracking-wider text-(--app-ink-3)">
            hire a freelancer
          </span>
        </h1>
        <Link
          href="/marketplace/cart"
          className="relative p-2 rounded-lg bg-(--app-surface-2) text-(--app-ink-2) hover:bg-(--app-surface-hover)"
          aria-label="Cart"
        >
          <ShoppingCart className="w-4 h-4" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-(--app-cta) text-(--app-on-cta) text-[10px] font-bold flex items-center justify-center tabular-nums">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </Link>
        <Link
          href="/services/my"
          className="p-2 rounded-lg bg-(--app-surface-2) text-(--app-ink-2) hover:bg-(--app-surface-hover)"
          aria-label="My services"
        >
          <Briefcase className="w-4 h-4" />
        </Link>
        <Link
          href="/marketplace/orders"
          className="p-2 rounded-lg bg-(--app-surface-2) text-(--app-ink-2) hover:bg-(--app-surface-hover)"
          aria-label="Orders"
        >
          <ListChecks className="w-4 h-4" />
        </Link>
        <Link
          href="/marketplace/messages"
          className="p-2 rounded-lg bg-(--app-surface-2) text-(--app-ink-2) hover:bg-(--app-surface-hover)"
          aria-label="Messages"
        >
          <MessagesSquare className="w-4 h-4" />
        </Link>
      </div>
      <p className="text-xs text-(--app-ink-3) -mt-2">
        Order work from freelancers on RevType. Payment is held in escrow until the work is delivered.
      </p>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--app-ink-3)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="What do you need done? (logo, article, website…)"
            className="w-full pl-9 pr-3 py-2 bg-(--app-surface) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort"
          className="px-3 py-2 bg-(--app-surface) border border-(--app-line) rounded-lg text-(--app-ink) text-sm focus:outline-none focus:border-(--app-accent-edge)"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Link
          href="/services/create"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-semibold whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Offer a service
        </Link>
      </div>

      {/* Service categories */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setCategory("")} className={chipClass(!category)}>
          All categories
          <span className="ml-1 text-[10px] opacity-70 tabular-nums">{total}</span>
        </button>
        {SERVICE_CATEGORIES.map((c) => (
          <button
            key={c.slug}
            onClick={() => setCategory(c.slug === category ? "" : c.slug)}
            className={chipClass(category === c.slug)}
          >
            {c.label}
            {counts[c.slug] ? (
              <span className="ml-1 text-[10px] opacity-70 tabular-nums">{counts[c.slug]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-(--app-line) bg-(--app-surface)">
          <span className="text-[10px] font-bold uppercase tracking-wider text-(--app-ink-3)">
            Budget $
          </span>
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="min"
            aria-label="Minimum price"
            className="w-16 bg-transparent text-white text-xs focus:outline-none tabular-nums"
          />
          <span className="text-(--app-glyph)">–</span>
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="max"
            aria-label="Maximum price"
            className="w-16 bg-transparent text-white text-xs focus:outline-none tabular-nums"
          />
        </div>
        {anyFilterActive && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 text-red-300 border border-red-500/30 font-bold hover:bg-red-500/20"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ListSkeleton key={i} rows={2} />
          ))}
        </div>
      )}

      {!loading && listings.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title="No services match these filters"
          description={
            anyFilterActive
              ? "Try widening the search or clearing some filters."
              : "Be the first to offer a service."
          }
          action={{ label: "Offer a service", href: "/services/create" }}
        />
      )}

      {!loading && listings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {listings.map((l) => (
            <ListingCardV2 key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function chipClass(active: boolean) {
  return cn(
    "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors whitespace-nowrap",
    active
      ? "bg-(--app-cta)/15 text-(--app-accent-ink) border-(--app-accent-edge)/40"
      : "bg-(--app-surface) text-(--app-ink-3) border-(--app-line) hover:border-(--app-line)"
  );
}
