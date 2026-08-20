"use client";

import { useEffect, useState } from "react";
import {
  Gavel,
  Loader2,
  Crown,
  TrendingUp,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Avatar } from "@/components/user/primitives/avatar";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";

interface BidRow {
  id: string;
  amount: number;
  status: string;
  message: string | null;
  createdAt: string;
  bidder: { id: string; name: string; avatar: string | null };
}

interface Props {
  listingId: string;
  startingBid: number | null;
  reservePrice: number | null; // hidden for buyers, but lets seller see "reserve met"
  buyNowPrice: number | null;
  auctionEndsAt: string | null;
  isOwner: boolean;
  isSold: boolean;
  currentUserId: string | null;
}

const POLL_MS = 15000; // bids move in minutes, not seconds

export function BidPanel({
  listingId,
  startingBid,
  reservePrice,
  buyNowPrice,
  auctionEndsAt,
  isOwner,
  isSold,
  currentUserId,
}: Props) {
  const [bids, setBids] = useState<BidRow[]>([]);
  // Server-side total — `bids` is only the most recent 25.
  const [totalBids, setTotalBids] = useState(0);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const refresh = async () => {
    try {
      const r = await fetch(`/api/marketplace/listings/${listingId}/bids`);
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setBids((d.bids ?? []) as BidRow[]);
        setTotalBids(Number(d.totalBids ?? (d.bids ?? []).length));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const handle = setInterval(() => {
      // Skip while the tab is hidden — a backgrounded tab polled forever,
      // which at scale is load nobody is even looking at.
      if (document.visibilityState !== "hidden") refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(handle);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  const high = bids.find((b) => b.status === "ACTIVE");
  const isHighBidder = high && currentUserId && high.bidder.id === currentUserId;
  const ended =
    !!auctionEndsAt && new Date(auctionEndsAt).getTime() < Date.now();

  const minNextBid = high
    ? high.amount + Math.max(10, Math.round(high.amount * 0.05))
    : startingBid ?? 0;

  const placeBid = async () => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a valid bid amount");
      return;
    }
    if (n < minNextBid) {
      toast.error(
        `Bid must be at least $${minNextBid.toLocaleString()}`
      );
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/marketplace/listings/${listingId}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ amount: n, message: message || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success(
        d.reserveMet
          ? "You're the high bidder! Reserve met."
          : "Bid placed — reserve not yet met."
      );
      setAmount("");
      setMessage("");
      refresh();
    } catch (err) {
      toast.error("Failed to place bid", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-purple-500/20 bg-linear-to-br from-purple-500/5 via-gray-900 to-gray-900 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center">
            <Gavel className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Live auction</h3>
            {auctionEndsAt && (
              <p className="text-[11px] text-gray-400 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {ended ? (
                  <span className="text-amber-400 font-bold">Auction ended</span>
                ) : (
                  <>
                    Ends{" "}
                    {formatDistanceToNow(new Date(auctionEndsAt), {
                      addSuffix: true,
                    })}
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        {high && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
              Current high bid
            </p>
            <p className="text-xl font-extrabold text-amber-300 tabular-nums">
              ${high.amount.toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {!high && (
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 p-3 text-center text-xs text-gray-400">
          {isSold
            ? "No bids were placed before the auction closed."
            : "No bids yet — be the first."}
        </div>
      )}

      {high && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-3">
          <Avatar
            src={high.bidder.avatar}
            size={36}
            name={high.bidder.name}
            fallbackClassName="bg-linear-to-br from-amber-400 to-orange-500"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white inline-flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-300" />
              {high.bidder.name}
              {isHighBidder && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 font-bold">
                  You
                </span>
              )}
            </p>
            <p className="text-[11px] text-gray-400">
              {formatDistanceToNow(new Date(high.createdAt), {
                addSuffix: true,
              })}
              {isOwner && reservePrice != null && (
                <span className="ml-2">
                  ·{" "}
                  {high.amount >= reservePrice ? (
                    <span className="text-emerald-300 font-bold">
                      Reserve met
                    </span>
                  ) : (
                    <span className="text-amber-300 font-bold">
                      Reserve not met
                    </span>
                  )}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Place bid form — only when not owner, not sold, not ended */}
      {!isOwner && !isSold && !ended && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={minNextBid}
              step="0.01"
              placeholder={`Min ${minNextBid.toLocaleString()}`}
              className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 tabular-nums"
            />
            <button
              type="button"
              onClick={placeBid}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-linear-to-r from-purple-600 to-indigo-600 hover:opacity-90 text-white text-sm font-bold disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <TrendingUp className="w-4 h-4" />
                  Place bid
                </>
              )}
            </button>
          </div>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional message to seller…"
            maxLength={500}
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
          {buyNowPrice != null && (
            <p className="text-[11px] text-gray-500">
              Skip the wait — buy now for{" "}
              <strong className="text-amber-300 tabular-nums">
                ${buyNowPrice.toLocaleString()}
              </strong>
            </p>
          )}
        </div>
      )}

      {ended && !isSold && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200 inline-flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          Auction ended. The seller or an admin can close it to settle the
          winner.
        </div>
      )}

      {/* Bid history toggle */}
      {bids.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-[11px] text-gray-400 hover:text-white underline"
          >
            {showHistory ? "Hide" : "Show"} bid history ({totalBids})
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {bids.map((b) => (
                <li
                  key={b.id}
                  className={cn(
                    "flex items-center gap-2 text-xs p-2 rounded-lg",
                    b.status === "ACTIVE"
                      ? "bg-amber-500/5 border border-amber-500/30"
                      : "bg-gray-950 border border-gray-800"
                  )}
                >
                  <span className="text-gray-300 truncate flex-1">
                    {b.bidder.name}
                  </span>
                  <span className="text-white font-bold tabular-nums">
                    ${b.amount.toLocaleString()}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded",
                      b.status === "ACTIVE"
                        ? "bg-amber-500/15 text-amber-300"
                        : b.status === "WON"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-slate-700/50 text-slate-300"
                    )}
                  >
                    {b.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading && bids.length === 0 && (
        <p className="text-xs text-gray-500 inline-flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading bids…
        </p>
      )}
    </section>
  );
}
