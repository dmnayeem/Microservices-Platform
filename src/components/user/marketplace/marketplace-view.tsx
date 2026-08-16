"use client";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  ShoppingBag,
  Package,
  ListChecks,
  MessagesSquare,
  ShoppingCart,
  ShieldCheck,
  Sparkles,
  Gavel,
  Heart,
  Eye,
  TrendingUp,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { ASSET_TYPE_LABEL } from "@/lib/marketplace-categories";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { AffiliateRewardBadge } from "@/components/user/affiliate/affiliate-reward-badge";
import { cn } from "@/lib/utils";

interface Listing {
  id: string;
  title: string;
  description: string;
  category: string;
  assetType: string;
  subType: string | null;
  price: number;
  currency: string;
  images: string[];
  screenshots: string[];
  views: number;
  uniqueViewers: number;
  watchCount: number;
  isWatched: boolean;
  monthlyRevenue: number | null;
  monthlyProfit: number | null;
  monthlyTraffic: number | null;
  assetAgeMonths: number | null;
  niche: string | null;
  verifiedMetrics: boolean;
  isFeatured: boolean;
  isPromoted: boolean;
  auctionMode: boolean;
  buyNowPrice: number | null;
  startingBid: number | null;
  auctionEndsAt: string | null;
  createdAt: string;
  seller: { name: string | null; avatar: string | null };
  /** Affiliate-only commission (set by the API only for approved affiliates). */
  affiliateReward?: string | null;
}

interface Facet {
  assetType: string;
  count: number;
}

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "createdAt-desc", label: "Newest" },
  { value: "price-asc", label: "Price ↑" },
  { value: "price-desc", label: "Price ↓" },
  { value: "revenue-desc", label: "Revenue ↓" },
  { value: "views-desc", label: "Most viewed" },
];

export function MarketplaceView() {
  const [search, setSearch] = useState("");
  const [assetType, setAssetType] = useState<string>("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [monetizedOnly, setMonetizedOnly] = useState(false);
  const [auctionOnly, setAuctionOnly] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  // Asset-age bucket → maps to minAgeMonths/maxAgeMonths query params.
  const [ageBucket, setAgeBucket] = useState("");
  const [sort, setSort] = useState("createdAt-desc");
  const [listings, setListings] = useState<Listing[]>([]);
  const [facets, setFacets] = useState<Facet[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false); // mobile filter sheet

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
    const params = new URLSearchParams();
    if (assetType) params.set("assetType", assetType);
    if (search) params.set("search", search);
    if (verifiedOnly) params.set("verified", "true");
    if (monetizedOnly) params.set("monetized", "true");
    if (auctionOnly) params.set("auction", "true");
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (ageBucket) {
      const [lo, hi] = ageBucket.split("-");
      if (lo) params.set("minAgeMonths", lo);
      if (hi) params.set("maxAgeMonths", hi);
    }
    const [sortBy, sortOrder] = sort.split("-");
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    fetch(`/api/marketplace/listings?${params}`)
      .then((r) => (r.ok ? r.json() : { listings: [], facets: { assetTypes: [] } }))
      .then((d) => {
        if (cancelled) return;
        setListings(d.listings ?? []);
        setFacets(d.facets?.assetTypes ?? []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [
    assetType,
    search,
    verifiedOnly,
    monetizedOnly,
    auctionOnly,
    minPrice,
    maxPrice,
    ageBucket,
    sort,
  ]);

  const anyFilterActive =
    assetType ||
    search ||
    verifiedOnly ||
    monetizedOnly ||
    auctionOnly ||
    minPrice ||
    maxPrice ||
    ageBucket;

  const clearAll = () => {
    setAssetType("");
    setSearch("");
    setVerifiedOnly(false);
    setMonetizedOnly(false);
    setAuctionOnly(false);
    setMinPrice("");
    setMaxPrice("");
    setAgeBucket("");
  };

  // Count of the toggle/price refinements (excludes assetType chips + search,
  // which have their own always-visible controls) — drives the mobile badge.
  const refineCount =
    (verifiedOnly ? 1 : 0) +
    (monetizedOnly ? 1 : 0) +
    (auctionOnly ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (ageBucket ? 1 : 0);

  // Shared toggle + price controls — rendered inline on desktop and inside the
  // mobile BottomSheet. Identical state/handlers → behaviour is unchanged.
  const filterControls = (
    <>
      <ToggleChip
        icon={<ShieldCheck className="w-3 h-3" />}
        active={verifiedOnly}
        label="Verified metrics"
        onClick={() => setVerifiedOnly((v) => !v)}
        tone="emerald"
      />
      <ToggleChip
        icon={<TrendingUp className="w-3 h-3" />}
        active={monetizedOnly}
        label="Monetized only"
        onClick={() => setMonetizedOnly((v) => !v)}
        tone="amber"
      />
      <ToggleChip
        icon={<Gavel className="w-3 h-3" />}
        active={auctionOnly}
        label="Auctions only"
        onClick={() => setAuctionOnly((v) => !v)}
        tone="purple"
      />
      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-800 bg-gray-900">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          $
        </span>
        <input
          type="number"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          placeholder="min"
          className="w-16 bg-transparent text-white text-xs focus:outline-none tabular-nums"
        />
        <span className="text-gray-600">–</span>
        <input
          type="number"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          placeholder="max"
          className="w-16 bg-transparent text-white text-xs focus:outline-none tabular-nums"
        />
      </div>
      <select
        value={ageBucket}
        onChange={(e) => setAgeBucket(e.target.value)}
        className="px-2.5 py-1 rounded-full border border-gray-800 bg-gray-900 text-white text-xs focus:outline-none focus:border-indigo-500"
        aria-label="Asset age"
      >
        <option value="">Any age</option>
        <option value="0-12">Under 1 year</option>
        <option value="12-36">1–3 years</option>
        <option value="36-60">3–5 years</option>
        <option value="60-">5+ years</option>
      </select>
      {anyFilterActive && (
        <button
          onClick={clearAll}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 text-red-300 border border-red-500/30 font-bold hover:bg-red-500/20"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <AdRenderer placement="MARKETPLACE_TOP" />
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex-1 inline-flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-indigo-400" /> Marketplace
          <span className="text-xs font-mono uppercase tracking-wider text-slate-500">
            digital assets
          </span>
        </h1>
        <Link
          href="/marketplace/cart"
          className="relative p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700"
          aria-label="Cart"
        >
          <ShoppingCart className="w-4 h-4" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </Link>
        <Link
          href="/marketplace/my"
          className="p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700"
          aria-label="My listings"
        >
          <Package className="w-4 h-4" />
        </Link>
        <Link
          href="/marketplace/orders"
          className="p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700"
          aria-label="Orders"
        >
          <ListChecks className="w-4 h-4" />
        </Link>
        <Link
          href="/marketplace/messages"
          className="p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700"
          aria-label="Messages"
        >
          <MessagesSquare className="w-4 h-4" />
        </Link>
      </div>

      {/* Search + Sell */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search marketplace (title, description, niche)…"
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Link
          href="/marketplace/create"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Sell
        </Link>
      </div>

      {/* Asset-type chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setAssetType("")}
          className={chipClass(!assetType)}
        >
          All types
          <span className="ml-1 text-[10px] opacity-70 tabular-nums">
            {facets.reduce((s, f) => s + f.count, 0)}
          </span>
        </button>
        {facets.map((f) => (
          <button
            key={f.assetType}
            onClick={() => setAssetType(f.assetType)}
            className={chipClass(assetType === f.assetType)}
          >
            {ASSET_TYPE_LABEL[f.assetType] ?? f.assetType}
            <span className="ml-1 text-[10px] opacity-70 tabular-nums">
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Toggle filters + price range — inline on desktop, tucked into a
          BottomSheet on mobile to keep the top of the list clean. */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 text-xs">
        {filterControls}
      </div>
      <button
        onClick={() => setFiltersOpen(true)}
        className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-200 text-xs font-semibold"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Filters
        {refineCount > 0 && (
          <span className="min-w-4 h-4 px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold inline-flex items-center justify-center tabular-nums">
            {refineCount}
          </span>
        )}
      </button>

      <BottomSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filters"
        description="Refine by metrics, format, and price."
        footer={
          <button
            onClick={() => setFiltersOpen(false)}
            className="w-full py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold"
          >
            Show results
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {filterControls}
        </div>
      </BottomSheet>

      {/* Results */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ListSkeleton key={i} rows={2} />
          ))}
        </div>
      )}

      {!loading && listings.length === 0 && (
        <EmptyState
          icon={ShoppingBag}
          title="No listings match these filters"
          description={
            anyFilterActive
              ? "Try widening the search or clearing some filters."
              : "Be the first to list a digital asset."
          }
          action={{ label: "Create Listing", href: "/marketplace/create" }}
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
      ? "bg-indigo-500/15 text-indigo-200 border-indigo-500/40"
      : "bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-700"
  );
}

function ToggleChip({
  icon,
  active,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  active: boolean;
  label: string;
  onClick: () => void;
  tone: "emerald" | "amber" | "purple";
}) {
  const tones = {
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    purple: "bg-purple-500/15 text-purple-300 border-purple-500/40",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors",
        active
          ? tones[tone]
          : "bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-700"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ListingCardV2({ listing }: { listing: Listing }) {
  const [watched, setWatched] = useState(listing.isWatched);
  const [watchBusy, setWatchBusy] = useState(false);

  const toggleWatch = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (watchBusy) return;
    setWatchBusy(true);
    try {
      const res = await fetch(`/api/marketplace/listings/${listing.id}/watch`, {
        method: watched ? "DELETE" : "POST",
      });
      if (res.ok) setWatched(!watched);
    } finally {
      setWatchBusy(false);
    }
  };

  const cover = listing.images[0] ?? listing.screenshots[0];

  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className="group block glass rounded-xl overflow-hidden hover:border-indigo-500/40 transition-colors"
    >
      <div className="relative aspect-video bg-gray-950 overflow-hidden">
        {cover ? (
          <SmartImage
            src={cover}
            alt=""
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="w-10 h-10 text-gray-700" />
          </div>
        )}
        {/* Top-left flags */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {listing.isFeatured && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/90 text-white text-[10px] font-extrabold uppercase tracking-wider">
              <Sparkles className="w-2.5 h-2.5" />
              Featured
            </span>
          )}
          {listing.verifiedMetrics && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/90 text-white text-[10px] font-extrabold uppercase tracking-wider"
              title="Admin-verified metrics"
            >
              <ShieldCheck className="w-2.5 h-2.5" />
              Verified
            </span>
          )}
          {listing.auctionMode && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/90 text-white text-[10px] font-extrabold uppercase tracking-wider">
              <Gavel className="w-2.5 h-2.5" />
              Auction
            </span>
          )}
        </div>
        {/* Watch button */}
        <button
          onClick={toggleWatch}
          disabled={watchBusy}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 disabled:opacity-50"
          title={watched ? "Remove from watchlist" : "Add to watchlist"}
        >
          <Heart
            className={cn(
              "w-3.5 h-3.5",
              watched ? "fill-rose-500 text-rose-500" : "text-white"
            )}
          />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            {ASSET_TYPE_LABEL[listing.assetType] ?? listing.assetType}
          </span>
          {listing.niche && (
            <span className="text-[10px] text-gray-500 truncate">
              {listing.niche}
            </span>
          )}
        </div>

        <p className="text-sm font-bold text-white truncate" title={listing.title}>
          {listing.title}
        </p>

        {/* Metric chips: revenue / traffic / age */}
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {listing.monthlyRevenue && listing.monthlyRevenue > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <span className="text-amber-500">$</span>
              <span className="font-bold tabular-nums">
                {compactMoney(listing.monthlyRevenue)}
              </span>
              <span className="text-gray-500">/mo rev</span>
            </span>
          ) : null}
          {listing.monthlyTraffic && listing.monthlyTraffic > 0 ? (
            <span className="inline-flex items-center gap-1 text-sky-300">
              <span className="font-bold tabular-nums">
                {compactNumber(listing.monthlyTraffic)}
              </span>
              <span className="text-gray-500">/mo visits</span>
            </span>
          ) : null}
          {listing.assetAgeMonths ? (
            <span className="inline-flex items-center gap-1 text-purple-300">
              <span className="font-bold tabular-nums">
                {formatAge(listing.assetAgeMonths)}
              </span>
              <span className="text-gray-500">old</span>
            </span>
          ) : null}
        </div>

        <div className="flex items-end justify-between pt-2 border-t border-gray-800">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              {listing.auctionMode ? "Current price" : "Asking"}
            </p>
            <p className="text-base font-extrabold text-white tabular-nums">
              ${compactMoney(listing.price)}
            </p>
            <AffiliateRewardBadge reward={listing.affiliateReward} className="mt-1" />
          </div>
          <div className="text-right text-[10px] text-gray-500">
            <p className="inline-flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {compactNumber(listing.views)}
            </p>
            <p className="inline-flex items-center gap-1">
              <Heart className="w-3 h-3" />
              {compactNumber(listing.watchCount)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Human age from a month count: "2y 3m", "8mo", "<1mo". */
function formatAge(months: number): string {
  if (months < 1) return "<1mo";
  if (months < 12) return `${months}mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y}y ${m}m` : `${y}y`;
}

function compactMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
