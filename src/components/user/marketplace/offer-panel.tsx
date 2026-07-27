"use client";

import { useEffect, useState } from "react";
import {
  HandCoins,
  Loader2,
  Check,
  X,
  Reply,
  Inbox,
  Send,
} from "lucide-react";
import { Avatar } from "@/components/user/primitives/avatar";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";

interface OfferRow {
  id: string;
  amount: number;
  message: string | null;
  status: string;
  counterAmount: number | null;
  counterMessage: string | null;
  createdAt: string;
  isOwnOffer: boolean;
  buyer: { id: string; name: string; avatar: string | null };
}

interface Props {
  listingId: string;
  askingPrice: number;
  isOwner: boolean;
  isSold: boolean;
}

export function OfferPanel({ listingId, askingPrice, isOwner, isSold }: Props) {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [counterDraft, setCounterDraft] = useState<{
    offerId: string;
    amount: string;
    message: string;
  } | null>(null);

  const refresh = async () => {
    try {
      const r = await fetch(`/api/marketplace/listings/${listingId}/offers`);
      const d = await r.json().catch(() => ({}));
      if (r.ok) setOffers((d.offers ?? []) as OfferRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  const submit = async () => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a valid offer amount");
      return;
    }
    setBusy("submit");
    try {
      const r = await fetch(`/api/marketplace/listings/${listingId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ amount: n, message: message || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success("Offer submitted");
      setAmount("");
      setMessage("");
      setShowForm(false);
      refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(null);
    }
  };

  const action = async (
    offerId: string,
    payload:
      | { action: "accept" }
      | { action: "reject" }
      | { action: "withdraw" }
      | { action: "counter"; counterAmount: number; counterMessage?: string }
  ) => {
    setBusy(`${offerId}:${payload.action}`);
    try {
      const r = await fetch(
        `/api/marketplace/listings/${listingId}/offers/${offerId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success(
        payload.action === "accept"
          ? "Offer accepted — listing sold"
          : payload.action === "reject"
          ? "Offer rejected"
          : payload.action === "counter"
          ? "Counter-offer sent"
          : "Offer withdrawn"
      );
      setCounterDraft(null);
      refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(null);
    }
  };

  const visibleOffers = offers.filter((o) =>
    isOwner ? true : o.isOwnOffer
  );

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center">
            {isOwner ? (
              <Inbox className="w-4 h-4" />
            ) : (
              <HandCoins className="w-4 h-4" />
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {isOwner ? "Offers received" : "Make an offer"}
            </h3>
            <p className="text-[11px] text-gray-500">
              {isOwner
                ? "Accept, reject, or counter incoming offers."
                : "Submit your best price — seller can accept or counter."}
            </p>
          </div>
        </div>
        {!isOwner && !isSold && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold"
          >
            <Send className="w-3.5 h-3.5" />
            Make offer
          </button>
        )}
      </div>

      {/* Buyer's own form */}
      {!isOwner && showForm && !isSold && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              step="0.01"
              placeholder={`Offer (asking $${askingPrice.toLocaleString()})`}
              className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy === "submit"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50"
            >
              {busy === "submit" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Send"
              )}
            </button>
          </div>
          <textarea
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional message — give context for your offer…"
            maxLength={500}
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-[11px] text-gray-500 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Offer list */}
      {loading ? (
        <p className="text-xs text-gray-500 inline-flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading offers…
        </p>
      ) : visibleOffers.length === 0 ? (
        <p className="text-xs text-gray-500 italic">
          {isOwner ? "No offers yet." : "You haven't made any offers yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleOffers.map((o) => (
            <li
              key={o.id}
              className={cn(
                "rounded-lg border p-3 space-y-2",
                o.status === "ACCEPTED"
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : o.status === "REJECTED"
                  ? "border-red-500/30 bg-red-500/5"
                  : o.status === "COUNTERED"
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-gray-800 bg-gray-950"
              )}
            >
              <div className="flex items-start gap-3">
                <Avatar
                  src={o.buyer.avatar}
                  size={32}
                  name={o.buyer.name}
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">
                    {o.buyer.name}
                    {o.isOwnOffer && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 font-bold">
                        You
                      </span>
                    )}
                    <span
                      className={cn(
                        "ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold",
                        o.status === "PENDING" &&
                          "bg-amber-500/15 text-amber-300",
                        o.status === "ACCEPTED" &&
                          "bg-emerald-500/15 text-emerald-300",
                        o.status === "REJECTED" &&
                          "bg-red-500/15 text-red-300",
                        o.status === "COUNTERED" &&
                          "bg-amber-500/15 text-amber-300",
                        o.status === "WITHDRAWN" &&
                          "bg-slate-700/50 text-slate-300"
                      )}
                    >
                      {o.status}
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {formatDistanceToNow(new Date(o.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <p className="text-base font-extrabold text-white tabular-nums">
                  ${o.amount.toLocaleString()}
                </p>
              </div>

              {o.message && (
                <p className="text-xs text-gray-300 whitespace-pre-wrap pl-11">
                  &ldquo;{o.message}&rdquo;
                </p>
              )}

              {o.status === "COUNTERED" && o.counterAmount != null && (
                <div className="pl-11">
                  <p className="text-[11px] text-amber-300 font-bold">
                    Seller counter:{" "}
                    <span className="tabular-nums">
                      ${o.counterAmount.toLocaleString()}
                    </span>
                  </p>
                  {o.counterMessage && (
                    <p className="text-xs text-gray-300 mt-1">
                      &ldquo;{o.counterMessage}&rdquo;
                    </p>
                  )}
                </div>
              )}

              {/* Counter form */}
              {counterDraft?.offerId === o.id && (
                <div className="pl-11 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      value={counterDraft.amount}
                      onChange={(e) =>
                        setCounterDraft({ ...counterDraft, amount: e.target.value })
                      }
                      placeholder="Counter amount"
                      className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500 tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={busy === `${o.id}:counter`}
                      onClick={() => {
                        const n = parseFloat(counterDraft.amount);
                        if (!Number.isFinite(n) || n <= 0) {
                          toast.error("Invalid counter");
                          return;
                        }
                        action(o.id, {
                          action: "counter",
                          counterAmount: n,
                          counterMessage: counterDraft.message || undefined,
                        });
                      }}
                      className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold disabled:opacity-50"
                    >
                      {busy === `${o.id}:counter` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Send"
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={counterDraft.message}
                    onChange={(e) =>
                      setCounterDraft({ ...counterDraft, message: e.target.value })
                    }
                    placeholder="Optional counter message…"
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setCounterDraft(null)}
                    className="text-[11px] text-gray-500 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Action buttons */}
              {(o.status === "PENDING" || o.status === "COUNTERED") && (
                <div className="pl-11 flex flex-wrap gap-2">
                  {isOwner ? (
                    <>
                      <button
                        type="button"
                        disabled={busy === `${o.id}:accept`}
                        onClick={() => action(o.id, { action: "accept" })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold disabled:opacity-50"
                      >
                        {busy === `${o.id}:accept` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busy === `${o.id}:reject`}
                        onClick={() => action(o.id, { action: "reject" })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-bold disabled:opacity-50"
                      >
                        {busy === `${o.id}:reject` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCounterDraft({
                            offerId: o.id,
                            amount: "",
                            message: "",
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold"
                      >
                        <Reply className="w-3 h-3" />
                        Counter
                      </button>
                    </>
                  ) : o.isOwnOffer ? (
                    <button
                      type="button"
                      disabled={busy === `${o.id}:withdraw`}
                      onClick={() => action(o.id, { action: "withdraw" })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-700/50 hover:bg-slate-700 text-slate-200 text-xs font-bold disabled:opacity-50"
                    >
                      {busy === `${o.id}:withdraw` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                      Withdraw
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
