"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/lib/confirm";
import { profileHref } from "@/lib/user-href";
import { AffiliateAttribution } from "@/components/user/affiliate/affiliate-attribution";
import { AffiliateShareButton } from "@/components/user/affiliate/affiliate-share-button";
import {
  ShoppingCart,
  Eye,
  Flag,
  Loader2,
  Heart,
  Share2,
  ShieldCheck,
  Sparkles,
  Gavel,
  Lock,
  Clock,
  TrendingUp,
  Coins,
  Calendar,
  Users as UsersIcon,
  FileText,
  Paperclip,
  ImageOff,
  ChevronLeft,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ImageZoomModal } from "@/components/user/primitives/image-zoom-modal";
import { ShareModal } from "@/components/user/primitives/share-modal";
import { ReportContent } from "@/components/user/primitives/report-content";
import { BidPanel } from "./bid-panel";
import { OfferPanel } from "./offer-panel";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { Avatar } from "@/components/user/primitives/avatar";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import {
  ASSET_TYPE_LABEL,
  getFieldsFor,
  type CategoryField,
} from "@/lib/marketplace-categories";

interface Listing {
  id: string;
  title: string;
  description: string;
  richDescription: string | null;
  category: string;
  assetType: string;
  subType: string | null;
  details: Record<string, unknown> | null;
  price: number;
  currency: string;
  images: string[];
  screenshots: string[];
  attachments: string[];
  status: string;
  views: number;
  uniqueViewers: number;
  watchCount: number;
  salesCount: number;
  monthlyRevenue: number | null;
  monthlyProfit: number | null;
  monthlyExpenses: number | null;
  monthlyTraffic: number | null;
  assetAgeMonths: number | null;
  niche: string | null;
  reasonsForSelling: string | null;
  whatsIncluded: string | null;
  whatsNotIncluded: string | null;
  verifiedMetrics: boolean;
  ndaGated: boolean;
  nsfw: boolean;
  auctionMode: boolean;
  startingBid: number | null;
  reservePrice: number | null;
  buyNowPrice: number | null;
  auctionEndsAt: string | null;
  isFeatured: boolean;
  isPromoted: boolean;
  createdAt: string;
  seller: {
    id: string;
    name: string | null;
    avatar: string | null;
    username: string | null;
    memberSince: string;
    totalListings: number;
  };
}

interface Props {
  listing: Listing;
  isOwner: boolean;
  isWatched: boolean;
  hideFinancials: boolean;
  viewerId: string;
}

export function ListingDetailView({
  listing,
  isOwner,
  isWatched: initialWatched,
  hideFinancials,
  viewerId,
}: Props) {
  const router = useRouter();
  const [zoom, setZoom] = useState<{ list: string[]; idx: number } | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [watched, setWatched] = useState(initialWatched);
  const [watchCount, setWatchCount] = useState(listing.watchCount);
  const [watchBusy, setWatchBusy] = useState(false);

  // Record a unique view on mount (deduped by sessionHash server-side)
  useEffect(() => {
    fetch(`/api/marketplace/listings/${listing.id}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "detail" }),
    }).catch(() => {});
  }, [listing.id]);

  const toggleWatch = async () => {
    if (watchBusy || isOwner) return;
    setWatchBusy(true);
    try {
      const res = await fetch(
        `/api/marketplace/listings/${listing.id}/watch`,
        {
          method: watched ? "DELETE" : "POST",
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setWatched(d.isWatched ?? !watched);
      if (typeof d.watchCount === "number") setWatchCount(d.watchCount);
      toast.success(
        d.isWatched ?? !watched ? "Added to watchlist" : "Removed from watchlist"
      );
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setWatchBusy(false);
    }
  };

  const addToCart = async () => {
    setAddingToCart(true);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ listingId: listing.id, quantity: 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Added to cart", {
        action: {
          label: "View cart",
          onClick: () => router.push("/marketplace/cart"),
        },
      });
    } catch (err) {
      toast.error("Couldn't add to cart", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setAddingToCart(false);
    }
  };

  const buy = async () => {
    // Confirm before committing wallet funds — once a marketplace listing
    // is purchased the status flips to SOLD and the spend is final.
    const ok = await confirmDialog({
      title: "Confirm purchase",
      description: `Buy "${listing.title}" for $${listing.price.toLocaleString()}? The amount will be debited from your wallet immediately.`,
      tone: "info",
      confirmLabel: "Buy now",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/marketplace/${listing.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 402 = wallet shortage. Surface the actual amount + nudge to /wallet.
        if (res.status === 402) {
          toast.error("Not enough in your wallet", {
            description: d.details ?? d.error ?? "Top up and try again.",
            action: {
              label: "Top up",
              onClick: () => router.push("/wallet"),
            },
          });
          return;
        }
        // 409 = race-loss. Specific copy.
        if (res.status === 409) {
          toast.error("Just missed it", {
            description: d.error ?? "Another buyer took this listing first.",
          });
          router.refresh();
          return;
        }
        throw new Error(d.error ?? d.details ?? `HTTP ${res.status}`);
      }
      toast.success("Purchase complete 🎉");
      router.push("/marketplace/orders");
    } catch (err) {
      toast.error("Purchase failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const fields = getFieldsFor(listing.assetType, listing.subType);
  // Group fields like the builder does, but drop fields that have no value
  const groupedFields = (() => {
    const out: { group: string; fields: CategoryField[] }[] = [];
    for (const f of fields) {
      const value = listing.details?.[f.key];
      const isEmpty =
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (isEmpty) continue;
      const groupName = f.group ?? "Details";
      const last = out[out.length - 1];
      if (last && last.group === groupName) last.fields.push(f);
      else out.push({ group: groupName, fields: [f] });
    }
    return out;
  })();

  return (
    <div className="space-y-5">
      <AffiliateAttribution targetType="MARKETPLACE" targetId={listing.id} />
      {(listing as { affiliateEligible?: boolean }).affiliateEligible && (
        <div className="flex justify-end">
          <AffiliateShareButton eligible />
        </div>
      )}
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to marketplace
      </Link>

      {/* Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        {/* Gallery */}
        <div className="space-y-2">
          <div
            className="relative aspect-video bg-gray-950 rounded-xl overflow-hidden cursor-zoom-in"
            onClick={() =>
              listing.images.length > 0 &&
              setZoom({ list: listing.images, idx: 0 })
            }
          >
            {listing.images[0] ? (
              <SmartImage
                src={listing.images[0]}
                alt=""
                fill
                sizes="100vw"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageOff className="w-12 h-12 text-gray-700" />
              </div>
            )}
            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
              {listing.isFeatured && (
                <Pill tone="amber" icon={<Sparkles className="w-3 h-3" />}>
                  Featured
                </Pill>
              )}
              {listing.verifiedMetrics && (
                <Pill tone="emerald" icon={<ShieldCheck className="w-3 h-3" />}>
                  Verified metrics
                </Pill>
              )}
              {listing.auctionMode && (
                <Pill tone="purple" icon={<Gavel className="w-3 h-3" />}>
                  Auction
                </Pill>
              )}
              {listing.ndaGated && (
                <Pill tone="slate" icon={<Lock className="w-3 h-3" />}>
                  NDA-gated
                </Pill>
              )}
            </div>
          </div>
          {listing.images.length > 1 && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {listing.images.slice(0, 10).map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setZoom({ list: listing.images, idx: i })}
                  className="relative aspect-square bg-gray-950 rounded-lg overflow-hidden border border-gray-800 hover:border-indigo-500/50"
                >
                  <SmartImage
                    src={url}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              {ASSET_TYPE_LABEL[listing.assetType] ?? listing.assetType}
            </span>
            {listing.subType && (
              <span className="text-[10px] text-gray-500 font-mono uppercase">
                {listing.subType}
              </span>
            )}
            {listing.niche && (
              <span className="text-xs text-gray-400">· {listing.niche}</span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
            {listing.title}
          </h1>

          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {listing.description}
          </p>

          {/* Price block */}
          <div className="glass rounded-xl p-4 space-y-2">
            <p className="text-[11px] uppercase tracking-wider font-bold text-gray-500">
              {listing.auctionMode ? "Current price" : "Asking price"}
            </p>
            <p className="text-3xl font-extrabold text-white tabular-nums">
              ${listing.price.toLocaleString()}
            </p>
            {listing.auctionMode && (
              <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                {listing.startingBid != null && (
                  <span>
                    Starting bid:{" "}
                    <strong className="text-white tabular-nums">
                      ${listing.startingBid.toLocaleString()}
                    </strong>
                  </span>
                )}
                {listing.buyNowPrice != null && (
                  <span>
                    Buy now:{" "}
                    <strong className="text-amber-300 tabular-nums">
                      ${listing.buyNowPrice.toLocaleString()}
                    </strong>
                  </span>
                )}
                {listing.auctionEndsAt && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Ends{" "}
                    {formatDistanceToNow(new Date(listing.auctionEndsAt), {
                      addSuffix: true,
                    })}
                  </span>
                )}
              </div>
            )}
            {!isOwner && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={addToCart}
                  disabled={addingToCart}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold disabled:opacity-50"
                >
                  {addingToCart ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="w-4 h-4" />
                  )}
                  Add to cart
                </button>
                <button
                  onClick={buy}
                  disabled={busy}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-linear-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white text-sm font-bold disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Buy now"
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="flex items-center gap-2">
            {!isOwner && (
              <button
                onClick={toggleWatch}
                disabled={watchBusy}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-bold transition-colors",
                  watched
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/40 hover:bg-rose-500/25"
                    : "bg-gray-900 text-gray-300 border-gray-800 hover:border-gray-700"
                )}
              >
                <Heart
                  className={cn(
                    "w-4 h-4",
                    watched ? "fill-rose-500 text-rose-500" : ""
                  )}
                />
                {watched ? "Watching" : "Watch"}
                <span className="text-[10px] opacity-70 tabular-nums ml-1">
                  {watchCount}
                </span>
              </button>
            )}
            <button
              onClick={() => setShowShare(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-800 bg-gray-900 hover:border-gray-700 text-sm text-gray-300"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
            {!isOwner && (
              <button
                onClick={() => setShowReport(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-800 bg-gray-900 hover:border-gray-700 text-sm text-gray-300"
                title="Report"
              >
                <Flag className="w-4 h-4" />
              </button>
            )}
            <div className="ml-auto text-right text-[10px] text-gray-500">
              <p className="inline-flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {listing.views.toLocaleString()} views
              </p>
              <p className="inline-flex items-center gap-1">
                <UsersIcon className="w-3 h-3" />
                {listing.uniqueViewers.toLocaleString()} unique
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Auction bidding (only when in auction mode) */}
      {listing.auctionMode && (
        <BidPanel
          listingId={listing.id}
          startingBid={listing.startingBid}
          reservePrice={isOwner ? listing.reservePrice : null}
          buyNowPrice={listing.buyNowPrice}
          auctionEndsAt={listing.auctionEndsAt}
          isOwner={isOwner}
          isSold={listing.status === "SOLD"}
          currentUserId={viewerId}
        />
      )}

      {/* Make-an-offer / offers inbox — works for any listing */}
      {listing.status === "ACTIVE" && (
        <OfferPanel
          listingId={listing.id}
          askingPrice={listing.price}
          isOwner={isOwner}
          isSold={listing.status !== "ACTIVE"}
        />
      )}

      {/* Financial / asset highlight cards */}
      {!hideFinancials && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            icon={<Coins className="w-4 h-4" />}
            tone="amber"
            label="Monthly revenue"
            value={
              listing.monthlyRevenue != null
                ? `$${listing.monthlyRevenue.toLocaleString()}`
                : "—"
            }
          />
          <MetricCard
            icon={<TrendingUp className="w-4 h-4" />}
            tone="emerald"
            label="Monthly profit"
            value={
              listing.monthlyProfit != null
                ? `$${listing.monthlyProfit.toLocaleString()}`
                : "—"
            }
          />
          <MetricCard
            icon={<Eye className="w-4 h-4" />}
            tone="sky"
            label="Monthly traffic"
            value={
              listing.monthlyTraffic != null
                ? listing.monthlyTraffic.toLocaleString()
                : "—"
            }
          />
          <MetricCard
            icon={<Calendar className="w-4 h-4" />}
            tone="purple"
            label="Asset age"
            value={
              listing.assetAgeMonths
                ? listing.assetAgeMonths >= 12
                  ? `${Math.round(listing.assetAgeMonths / 12 * 10) / 10} yr`
                  : `${listing.assetAgeMonths} mo`
                : "—"
            }
          />
        </div>
      )}

      {hideFinancials && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-white">Revenue figures are NDA-gated</p>
            <p className="text-xs text-amber-100/70 mt-1">
              The seller has hidden financials. Contact them to request NDA
              access before they share monthly revenue, profit, and reserve
              price.
            </p>
          </div>
        </div>
      )}

      {/* Rich description */}
      {listing.richDescription && (
        <section className="glass rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold text-white mb-2">About this asset</h3>
          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {listing.richDescription}
          </p>
        </section>
      )}

      {/* Sale terms */}
      {(listing.reasonsForSelling ||
        listing.whatsIncluded ||
        listing.whatsNotIncluded) && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {listing.reasonsForSelling && (
            <TermBlock title="Reasons for selling" body={listing.reasonsForSelling} />
          )}
          {listing.whatsIncluded && (
            <TermBlock title="What's included" body={listing.whatsIncluded} tone="emerald" />
          )}
          {listing.whatsNotIncluded && (
            <TermBlock
              title="What's NOT included"
              body={listing.whatsNotIncluded}
              tone="rose"
            />
          )}
        </section>
      )}

      {/* Category-specific details */}
      {groupedFields.length > 0 && (
        <section className="glass rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold text-white mb-3">
            Asset details
          </h3>
          <div className="space-y-4">
            {groupedFields.map((g) => (
              <div key={g.group}>
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
                  {g.group}
                </p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {g.fields.map((f) => (
                    <DetailRow
                      key={f.key}
                      field={f}
                      value={listing.details?.[f.key]}
                      onZoomImage={(url) => setZoom({ list: [url], idx: 0 })}
                    />
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Proof screenshots */}
      {listing.screenshots.length > 0 && (
        <section className="glass rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold text-white mb-3 inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Proof screenshots
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {listing.screenshots.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setZoom({ list: listing.screenshots, idx: i })}
                className="relative aspect-video rounded-lg overflow-hidden bg-gray-950 border border-gray-800 hover:border-emerald-500/40"
              >
                <SmartImage
                  src={url}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Attachments */}
      {listing.attachments.length > 0 && (
        <section className="glass rounded-xl p-4 sm:p-5">
          <h3 className="text-base font-bold text-white mb-3 inline-flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-indigo-400" />
            Attachments
          </h3>
          <ul className="space-y-1">
            {listing.attachments.map((url, i) => (
              <li key={i}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 text-xs font-mono text-indigo-300 hover:text-indigo-200 break-all"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Seller card */}
      <section className="glass rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <Avatar
            src={listing.seller.avatar}
            size={48}
            fallbackText={(listing.seller.name ?? listing.seller.username ?? "S")
              .charAt(0)
              .toUpperCase()}
          />
          <div className="flex-1 min-w-0">
            <Link
              href={profileHref(listing.seller)}
              className="text-sm font-bold text-white hover:text-indigo-400"
            >
              {listing.seller.name ?? "Seller"}
            </Link>
            {listing.seller.username && (
              <p className="text-[11px] text-gray-500">
                @{listing.seller.username}
              </p>
            )}
            <p className="text-[11px] text-gray-500 mt-0.5">
              Joined {format(new Date(listing.seller.memberSince), "MMM yyyy")}{" "}
              · {listing.seller.totalListings} listings
            </p>
          </div>
        </div>
      </section>

      {/* Modals */}
      {zoom && (
        <ImageZoomModal
          images={zoom.list}
          index={zoom.idx}
          open={!!zoom}
          onClose={() => setZoom(null)}
          onIndexChange={(next) =>
            setZoom((prev) => (prev ? { ...prev, idx: next } : prev))
          }
        />
      )}
      <ShareModal
        url={typeof window !== "undefined" ? window.location.href : ""}
        title={listing.title}
        open={showShare}
        onOpenChange={setShowShare}
      />
      <ReportContent
        targetType="LISTING"
        targetId={listing.id}
        open={showReport}
        onOpenChange={setShowReport}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: "amber" | "emerald" | "sky" | "purple";
  label: string;
  value: string;
}) {
  const tones = {
    amber: "text-amber-300 bg-amber-500/10 border-amber-500/30",
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    sky: "text-sky-300 bg-sky-500/10 border-sky-500/30",
    purple: "text-purple-300 bg-purple-500/10 border-purple-500/30",
  };
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={cn("p-1.5 rounded-md border", tones[tone])}>{icon}</span>
        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
          {label}
        </span>
      </div>
      <p className="text-lg font-extrabold text-white tabular-nums">{value}</p>
    </div>
  );
}

function TermBlock({
  title,
  body,
  tone = "indigo",
}: {
  title: string;
  body: string;
  tone?: "indigo" | "emerald" | "rose";
}) {
  const tones = {
    indigo: "border-indigo-500/20",
    emerald: "border-emerald-500/30",
    rose: "border-rose-500/30",
  };
  return (
    <div className={cn("rounded-xl border bg-gray-900 p-4", tones[tone])}>
      <h4 className="text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
        {title}
      </h4>
      <p className="text-xs text-gray-200 whitespace-pre-wrap leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function DetailRow({
  field,
  value,
  onZoomImage,
}: {
  field: CategoryField;
  value: unknown;
  onZoomImage: (url: string) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-gray-500 min-w-0 flex-1">{field.label}</dt>
      <dd className="text-right shrink-0 max-w-[60%]">
        <DetailValue field={field} value={value} onZoomImage={onZoomImage} />
      </dd>
    </div>
  );
}

function DetailValue({
  field,
  value,
  onZoomImage,
}: {
  field: CategoryField;
  value: unknown;
  onZoomImage: (url: string) => void;
}) {
  switch (field.type) {
    case "BOOLEAN":
      return (
        <span className={value ? "text-emerald-300 font-bold" : "text-gray-400"}>
          {value ? "Yes" : "No"}
        </span>
      );
    case "MONEY":
      return (
        <span className="text-amber-300 font-bold tabular-nums">
          ${(value as number).toLocaleString()}
        </span>
      );
    case "PERCENT":
      return (
        <span className="text-white font-bold tabular-nums">{String(value)}%</span>
      );
    case "NUMBER":
      return (
        <span className="text-white font-bold tabular-nums">
          {(value as number).toLocaleString()}
        </span>
      );
    case "URL":
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noreferrer noopener"
          className="text-indigo-300 hover:text-indigo-200 underline break-all font-mono text-[11px]"
        >
          {String(value)}
        </a>
      );
    case "SCREENSHOT":
      return typeof value === "string" ? (
        <button
          type="button"
          onClick={() => onZoomImage(value)}
          className="inline-block"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className="max-h-24 rounded border border-gray-800 hover:border-indigo-500/40"
          />
        </button>
      ) : null;
    case "DATE":
      return (
        <span className="text-white">
          {format(new Date(String(value)), "MMM d, yyyy")}
        </span>
      );
    default:
      return <span className="text-white">{String(value)}</span>;
  }
}

function Pill({
  tone,
  icon,
  children,
}: {
  tone: "amber" | "emerald" | "purple" | "slate";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones = {
    amber: "bg-amber-500/90 text-white",
    emerald: "bg-emerald-500/90 text-white",
    purple: "bg-purple-500/90 text-white",
    slate: "bg-slate-700/90 text-white",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider",
        tones[tone]
      )}
    >
      {icon}
      {children}
    </span>
  );
}
