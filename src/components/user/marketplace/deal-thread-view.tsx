"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { format, formatDistanceToNow } from "date-fns";
import {
  Loader2,
  Send,
  ShieldCheck,
  ChevronLeft,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Handshake,
  Package,
  Paperclip,
  RefreshCw,
  Upload,
  X,
  Clock,
} from "lucide-react";
import { cn, usd } from "@/lib/utils";
import { Avatar } from "@/components/user/primitives/avatar";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { uploadUserFile } from "@/lib/user-upload";
import { listingHref } from "@/lib/marketplace-categories";
import type { OrderBrief } from "@/lib/service-packages";
import { ShopPayChooser } from "@/components/user/shop-pay-chooser";
import type { ShopSource } from "@/lib/pay-source";

type Role = "BUYER" | "SELLER" | "ADMIN";
type DealStatus =
  | "PROPOSED"
  | "FUNDED"
  | "DELIVERED"
  | "RELEASED"
  | "REFUNDED"
  | "CANCELLED"
  | "DISPUTED";

interface Message {
  id: string;
  senderId: string;
  senderType: "USER" | "ADMIN" | "SYSTEM" | "DELIVERY" | "REVISION";
  body: string;
  attachments: string[];
  createdAt: string;
}
interface Deal {
  id: string;
  status: DealStatus;
  amount: number;
  adminMediated: boolean;
  adminFee: number;
  heldAmount: number;
  proposedById: string;
  autoReleaseAt: string | null;
  deliveredAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  /** Service order: package snapshot + the buyer's answers (null = custom deal). */
  order: OrderBrief | null;
  revisionsUsed: number;
}
interface Party {
  id: string;
  name: string | null;
  avatar: string | null;
}
interface ThreadData {
  thread: {
    id: string;
    role: Role;
    buyer: Party | null;
    seller: Party | null;
    listing: { id: string; title: string; price: number; status: string; assetType: string } | null;
    mediation: { enabled: boolean; feeBps: number };
  };
  messages: Message[];
  deals: Deal[];
}

const TERMINAL: DealStatus[] = ["RELEASED", "REFUNDED", "CANCELLED"];
const STATUS_STYLE: Record<DealStatus, string> = {
  PROPOSED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  FUNDED: "bg-(--app-cta)/15 text-(--app-accent-ink) border-(--app-accent-edge)/30",
  DELIVERED: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  RELEASED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  REFUNDED: "bg-(--app-ink-3)/15 text-(--app-ink-2) border-(--app-line)/30",
  CANCELLED: "bg-(--app-ink-3)/15 text-(--app-ink-3) border-(--app-line)/30",
  DISPUTED: "bg-red-500/15 text-red-300 border-red-500/30",
};

export function DealThreadView({ threadId, viewerId }: { threadId: string; viewerId: string }) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  // Set when funding from Ad Fund came back short — the Add fund link to show.
  const [fundAddFund, setFundAddFund] = useState<string | null>(null);
  // Service orders: the delivery / revision-request sheets.
  const [sheet, setSheet] = useState<{ kind: "deliver" | "revision"; dealId: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/marketplace/threads/${threadId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load conversation");
        const d = (await res.json()) as ThreadData;
        setData(d);
      } catch {
        if (!silent) toast.error("Could not load conversation");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [threadId]
  );

  useEffect(() => {
    load();
    const t = setInterval(() => {
      // Skip while the tab is hidden — a backgrounded tab polled forever,
      // which at scale is load nobody is even looking at.
      if (document.visibilityState !== "hidden") load(true);
    }, 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [data?.messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const res = await fetch(`/api/marketplace/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed to send");
      }
      setText("");
      await load(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const runAction = async (
    url: string,
    action: string,
    reason?: string,
    extra?: Record<string, unknown>
  ): Promise<boolean> => {
    setActionBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, ...extra }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 402 && d.addFund) setFundAddFund(d.addFund);
        throw new Error(d.error ?? "Action failed");
      }
      setFundAddFund(null);
      toast.success("Done");
      await load(true);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
      return false;
    } finally {
      setActionBusy(false);
    }
  };
  const dealAction = (dealId: string, action: string, reason?: string, extra?: Record<string, unknown>) =>
    runAction(`/api/marketplace/deals/${dealId}`, action, reason, extra);
  const adminAction = (dealId: string, action: string, reason?: string) =>
    runAction(`/api/admin/marketplace/deals/${dealId}`, action, reason);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-(--app-ink-3)" />
      </div>
    );
  }

  const { thread, messages, deals } = data;
  const role = thread.role;
  const other = role === "SELLER" ? thread.buyer : thread.seller;
  const activeDeal = deals.find((d) => !TERMINAL.includes(d.status)) ?? null;
  const lastTerminal = deals.find((d) => TERMINAL.includes(d.status)) ?? null;

  return (
    <div className="space-y-4">
      <Link
        href="/marketplace/messages"
        className="inline-flex items-center gap-1.5 text-sm text-(--app-ink-3) hover:text-(--app-ink)"
      >
        <ChevronLeft className="w-4 h-4" /> All messages
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-4">
        {/* Chat column */}
        <div className="glass rounded-2xl flex flex-col h-[70vh]">
          {/* Header */}
          <div className="flex items-center gap-3 p-3 border-b border-white/10">
            <Avatar src={other?.avatar ?? null} name={other?.name ?? "User"} size={36} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">
                {other?.name ?? "User"}
                {role === "ADMIN" && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-300">
                    mediating
                  </span>
                )}
              </p>
              {thread.listing && (
                <Link
                  href={listingHref(thread.listing)}
                  className="text-xs text-(--app-ink-3) hover:text-(--app-ink) truncate block"
                >
                  {thread.listing.title}
                </Link>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((m) => {
              if (m.senderType === "DELIVERY" || m.senderType === "REVISION") {
                return <OrderEventCard key={m.id} m={m} threadId={threadId} mine={m.senderId === viewerId} />;
              }
              if (m.senderType === "SYSTEM") {
                return (
                  <div key={m.id} className="text-center my-2">
                    <span className="inline-block text-[11px] text-(--app-ink-3) bg-white/5 border border-white/10 rounded-full px-3 py-1">
                      {m.body}
                    </span>
                  </div>
                );
              }
              const mine = m.senderId === viewerId;
              const isAdmin = m.senderType === "ADMIN";
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                      isAdmin
                        ? "bg-amber-500/15 text-amber-100 border border-amber-500/30"
                        : mine
                        ? "bg-(--app-cta) text-(--app-on-cta)"
                        : "bg-white/10 text-(--app-ink)"
                    )}
                  >
                    {isAdmin && (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-0.5">
                        Admin
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="text-[10px] opacity-60 mt-0.5">
                      {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && (
              <p className="text-center text-sm text-(--app-ink-3) py-8">
                No messages yet — say hello 👋
              </p>
            )}
          </div>

          {/* Composer */}
          <div className="p-3 border-t border-white/10 flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Type a message…"
              className="flex-1 resize-none bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge) max-h-32"
            />
            <button
              onClick={send}
              disabled={sending || !text.trim()}
              className="p-2.5 rounded-xl bg-(--app-cta) text-(--app-on-cta) hover:bg-(--app-cta) disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Deal panel */}
        <div className="glass rounded-2xl p-4 space-y-3 h-max">
          <div className="flex items-center gap-2">
            <Handshake className="w-4 h-4 text-(--app-accent-ink)" />
            <h3 className="text-sm font-bold text-white">Escrow deal</h3>
          </div>

          {activeDeal?.order && <OrderBriefCard deal={activeDeal} />}
          {activeDeal ? (
            <DealActions
              deal={activeDeal}
              role={role}
              viewerId={viewerId}
              busy={actionBusy}
              onAction={dealAction}
              addFundUrl={fundAddFund}
              onPaySourceChange={() => setFundAddFund(null)}
              onAdminAction={adminAction}
              onSheet={(kind) => setSheet({ kind, dealId: activeDeal.id })}
            />
          ) : (
            <>
              {lastTerminal?.order && <OrderBriefCard deal={lastTerminal} />}
              {lastTerminal && (
                <div className="text-xs text-(--app-ink-3)">
                  Last deal:{" "}
                  <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-bold", STATUS_STYLE[lastTerminal.status])}>
                    {lastTerminal.status}
                  </span>
                </div>
              )}
              {role !== "ADMIN" ? (
                <ProposeForm
                  defaultAmount={thread.listing?.price ?? 0}
                  mediation={thread.mediation}
                  threadId={threadId}
                  onDone={() => load(true)}
                />
              ) : (
                <p className="text-xs text-(--app-ink-3)">No active deal to mediate.</p>
              )}
            </>
          )}
        </div>
      </div>

      {sheet?.kind === "deliver" && (
        <DeliverSheet
          requireWork={!!deals.find((d) => d.id === sheet.dealId)?.order}
          busy={actionBusy}
          onClose={() => setSheet(null)}
          onSubmit={async (message, attachments) => {
            const ok = await runAction(`/api/marketplace/deals/${sheet.dealId}`, "deliver", undefined, {
              message,
              attachments,
            });
            if (ok) setSheet(null);
          }}
        />
      )}
      {sheet?.kind === "revision" && (
        <RevisionSheet
          busy={actionBusy}
          onClose={() => setSheet(null)}
          onSubmit={async (message) => {
            const ok = await runAction(`/api/marketplace/deals/${sheet.dealId}`, "revision", undefined, { message });
            if (ok) setSheet(null);
          }}
        />
      )}
    </div>
  );
}

function DealActions({
  deal,
  role,
  viewerId,
  busy,
  onAction,
  addFundUrl,
  onPaySourceChange,
  onAdminAction,
  onSheet,
}: {
  deal: Deal;
  role: Role;
  viewerId: string;
  busy: boolean;
  onAction: (dealId: string, action: string, reason?: string, extra?: Record<string, unknown>) => void;
  addFundUrl?: string | null;
  onPaySourceChange?: () => void;
  onAdminAction: (dealId: string, action: string, reason?: string) => void;
  onSheet: (kind: "deliver" | "revision") => void;
}) {
  const revisionsAllowed = deal.order?.tier.revisions ?? 0;
  const revisionsLeft = Math.max(0, revisionsAllowed - deal.revisionsUsed);
  const isBuyer = role === "BUYER";
  const isSeller = role === "SELLER";
  const isAdmin = role === "ADMIN";
  // Funding pays from Cash (default) or Ad Fund; a refund returns to the same.
  const [paySource, setPaySource] = useState<ShopSource>("CASH");
  const btn =
    "w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold disabled:opacity-50";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-lg font-extrabold text-white">{usd(deal.amount)}</span>
        <span className={cn("px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider", STATUS_STYLE[deal.status])}>
          {deal.status}
        </span>
      </div>
      {deal.adminMediated && (
        <p className="text-[11px] text-amber-300 inline-flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" /> Admin-mediated · fee {usd(deal.adminFee)}
        </p>
      )}
      {deal.status === "FUNDED" && (
        <p className="text-[11px] text-(--app-ink-3) inline-flex items-center gap-1">
          <Lock className="w-3.5 h-3.5" /> {usd(deal.heldAmount)} held in escrow
        </p>
      )}
      {deal.status === "DELIVERED" && deal.autoReleaseAt && (
        <p className="text-[11px] text-(--app-ink-3)">
          Auto-releases {formatDistanceToNow(new Date(deal.autoReleaseAt), { addSuffix: true })}
        </p>
      )}

      {/* Contextual actions */}
      {deal.status === "PROPOSED" && (
        <div className="space-y-2">
          {/* Buyer-proposed terms need the seller's acceptance before funding. */}
          {isBuyer && deal.proposedById !== viewerId && (
            <>
              <ShopPayChooser
                value={paySource}
                onChange={(v) => {
                  setPaySource(v);
                  onPaySourceChange?.();
                }}
                amountUsd={deal.amount + deal.adminFee}
                addFundUrl={addFundUrl}
              />
              <button disabled={busy} onClick={() => onAction(deal.id, "fund", undefined, { paySource })} className={cn(btn, "bg-(--app-cta) text-(--app-on-cta) hover:bg-(--app-cta)")}>
                Fund escrow {usd((deal.amount + deal.adminFee))}
              </button>
            </>
          )}
          {isBuyer && deal.proposedById === viewerId && (
            <p className="text-[11px] text-(--app-ink-3)">Waiting for the seller to accept your proposal.</p>
          )}
          {isSeller && deal.proposedById !== viewerId && (
            <button disabled={busy} onClick={() => onAction(deal.id, "accept")} className={cn(btn, "bg-(--app-cta) text-(--app-on-cta) hover:bg-(--app-cta)")}>
              <CheckCircle2 className="w-4 h-4" /> Accept {usd(deal.amount)}
            </button>
          )}
          {(isBuyer || isSeller) && (
            <button disabled={busy} onClick={() => onAction(deal.id, "cancel")} className={cn(btn, "bg-white/10 text-(--app-ink) hover:bg-white/20")}>
              Cancel
            </button>
          )}
          {isSeller && deal.proposedById === viewerId && <p className="text-[11px] text-(--app-ink-3)">Waiting for the buyer to fund.</p>}
        </div>
      )}

      {deal.status === "FUNDED" && (
        <div className="space-y-2">
          {isSeller && (
            <button disabled={busy} onClick={() => onSheet("deliver")} className={cn(btn, "bg-(--app-cta) text-(--app-on-cta) hover:bg-(--app-cta)")}>
              <Package className="w-4 h-4" /> Deliver work
            </button>
          )}
          {isSeller && (
            <button disabled={busy} onClick={() => onAction(deal.id, "refund")} className={cn(btn, "bg-white/10 text-(--app-ink) hover:bg-white/20")}>
              Refund buyer
            </button>
          )}
          {isBuyer && <p className="text-[11px] text-(--app-ink-3)">Funds are held — waiting for delivery.</p>}
          {(isBuyer || isSeller) && (
            <button disabled={busy} onClick={() => onAction(deal.id, "escalate")} className={cn(btn, "bg-red-500/15 text-red-300 hover:bg-red-500/25")}>
              <AlertTriangle className="w-4 h-4" /> Escalate to admin
            </button>
          )}
        </div>
      )}

      {deal.status === "DELIVERED" && (
        <div className="space-y-2">
          {isBuyer && (
            <button disabled={busy} onClick={() => onAction(deal.id, "confirm")} className={cn(btn, "bg-emerald-600 text-white hover:bg-emerald-700")}>
              <CheckCircle2 className="w-4 h-4" /> {deal.order ? "Accept & release payment" : "Confirm & release"}
            </button>
          )}
          {isBuyer && deal.order && revisionsLeft > 0 && (
            <button disabled={busy} onClick={() => onSheet("revision")} className={cn(btn, "bg-white/10 text-(--app-ink) hover:bg-white/20")}>
              <RefreshCw className="w-4 h-4" /> Request revision ({revisionsLeft} left)
            </button>
          )}
          {isBuyer && deal.order && revisionsLeft === 0 && (
            <p className="text-[11px] text-(--app-ink-3)">
              {revisionsAllowed === 0
                ? "This package has no revisions — accept the delivery or escalate to an admin."
                : "All included revisions are used — accept the delivery or escalate to an admin."}
            </p>
          )}
          {isSeller && <p className="text-[11px] text-(--app-ink-3)">Delivered — waiting for the buyer to confirm.</p>}
          {(isBuyer || isSeller) && (
            <button disabled={busy} onClick={() => onAction(deal.id, "escalate")} className={cn(btn, "bg-red-500/15 text-red-300 hover:bg-red-500/25")}>
              <AlertTriangle className="w-4 h-4" /> Escalate to admin
            </button>
          )}
        </div>
      )}

      {deal.status === "DISPUTED" && !isAdmin && (
        <p className="text-[11px] text-amber-300 inline-flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" /> Under admin review.
        </p>
      )}

      {/* Admin mediation controls */}
      {isAdmin && ["FUNDED", "DELIVERED", "DISPUTED"].includes(deal.status) && (
        <div className="space-y-2 pt-2 border-t border-white/10">
          <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">
            Admin mediation
          </p>
          <button disabled={busy} onClick={() => onAdminAction(deal.id, "assign")} className={cn(btn, "bg-white/10 text-(--app-ink) hover:bg-white/20")}>
            Assign to me
          </button>
          <button disabled={busy} onClick={() => onAdminAction(deal.id, "release")} className={cn(btn, "bg-emerald-600 text-white hover:bg-emerald-700")}>
            <CheckCircle2 className="w-4 h-4" /> Release to seller
          </button>
          <button disabled={busy} onClick={() => onAdminAction(deal.id, "refund")} className={cn(btn, "bg-red-500/15 text-red-300 hover:bg-red-500/25")}>
            Refund buyer
          </button>
        </div>
      )}
      {viewerId === deal.proposedById && deal.status === "PROPOSED" && (
        <p className="text-[10px] text-(--app-ink-3)">You proposed this deal.</p>
      )}
    </div>
  );
}

function ProposeForm({
  defaultAmount,
  mediation,
  threadId,
  onDone,
}: {
  defaultAmount: number;
  mediation: { enabled: boolean; feeBps: number };
  threadId: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(defaultAmount > 0 ? String(defaultAmount) : "");
  const [mediated, setMediated] = useState(false);
  const [busy, setBusy] = useState(false);
  const amt = parseFloat(amount) || 0;
  const fee = mediated ? Math.round((amt * mediation.feeBps) / 10000 * 100) / 100 : 0;

  const submit = async () => {
    if (amt <= 0) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      const res = await fetch("/api/marketplace/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, amount: amt, adminMediated: mediated }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Could not propose");
      toast.success("Deal proposed");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not propose");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-(--app-ink-3)">
        Agree a price, then the buyer funds escrow. Funds release to the seller once delivery is confirmed.
      </p>
      <div>
        <label className="block text-[11px] text-(--app-ink-3) mb-1">Amount ($)</label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-(--app-accent-edge)"
        />
      </div>
      {mediation.enabled && (
        <label className="flex items-start gap-2 text-xs text-(--app-ink-2) cursor-pointer">
          <input
            type="checkbox"
            checked={mediated}
            onChange={(e) => setMediated(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Admin-mediated deal
            <span className="block text-[10px] text-(--app-ink-3)">
              A platform admin oversees the deal. Buyer pays a {(mediation.feeBps / 100).toFixed(2)}% fee
              {fee > 0 && ` (+${usd(fee)})`}.
            </span>
          </span>
        </label>
      )}
      <button
        onClick={submit}
        disabled={busy || amt <= 0}
        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-(--app-cta) text-(--app-on-cta) text-sm font-bold hover:bg-(--app-cta) disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Handshake className="w-4 h-4" />}
        Propose deal
      </button>
    </div>
  );
}

/** A delivery (seller) or a revision request (buyer) in a service order. */
function OrderEventCard({ m, threadId, mine }: { m: Message; threadId: string; mine: boolean }) {
  const delivery = m.senderType === "DELIVERY";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm border",
          delivery
            ? "bg-emerald-500/10 border-emerald-500/30 text-(--app-ink)"
            : "bg-amber-500/10 border-amber-500/30 text-(--app-ink)"
        )}
      >
        <p
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider mb-0.5 inline-flex items-center gap-1",
            delivery ? "text-emerald-300" : "text-amber-300"
          )}
        >
          {delivery ? <Package className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
          {delivery ? "Delivery" : "Revision requested"}
        </p>
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        {m.attachments.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {m.attachments.map((url, i) => (
              <li key={i}>
                <a
                  href={`/api/marketplace/threads/${threadId}/files?m=${m.id}&n=${i}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-(--app-accent-ink) hover:underline break-all"
                >
                  <Paperclip className="w-3 h-3 shrink-0" />
                  {fileLabel(url)}
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] opacity-60 mt-0.5">
          {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

function fileLabel(url: string): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").pop() ?? "");
    // Uploaded keys are `<timestamp>_<random>_<name>` — show the name.
    const m = /^\d+_[a-z0-9]+_(.+)$/i.exec(last);
    return m ? m[1] : last || u.hostname;
  } catch {
    return url;
  }
}

/** What was ordered: package, price, due date, revisions and the buyer's answers. */
function OrderBriefCard({ deal }: { deal: Deal }) {
  // Read once per mount — render must stay pure.
  const [now] = useState(() => Date.now());
  const o = deal.order;
  if (!o) return null;
  const due = o.dueAt ? new Date(o.dueAt) : null;
  const waitingOnSeller = deal.status === "FUNDED";
  const late = !!due && waitingOnSeller && due.getTime() < now;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-white inline-flex items-center gap-1">
          <Package className="w-3.5 h-3.5 text-(--app-accent-ink)" />
          {o.tier.name} package
        </p>
        <span className="text-xs font-bold text-white tabular-nums">{usd(o.tier.price)}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-(--app-ink-2)">
        {due && (
          <span className={cn("inline-flex items-center gap-1", late && "text-rose-300 font-semibold")}>
            <Clock className="w-3 h-3" />
            Due {format(due, "d MMM yyyy")}
            {waitingOnSeller && ` (${late ? "late" : formatDistanceToNow(due, { addSuffix: true })})`}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          {o.tier.revisions === 0 ? "No revisions" : `Revisions ${deal.revisionsUsed} / ${o.tier.revisions}`}
        </span>
      </div>
      {o.tier.items.length > 0 && (
        <ul className="text-[11px] text-(--app-ink-3) list-disc pl-4">
          {o.tier.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
      {o.answers.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-white/10">
          <p className="text-[10px] uppercase tracking-wider font-bold text-(--app-ink-3)">Order requirements</p>
          {o.answers.map((a) => (
            <div key={a.id}>
              <p className="text-[11px] text-(--app-ink-3)">{a.label}</p>
              {a.type === "url" || a.type === "file" ? (
                <a
                  href={a.value}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="text-xs text-(--app-accent-ink) hover:underline break-all"
                >
                  {a.value}
                </a>
              ) : (
                <p className="text-xs text-white whitespace-pre-wrap break-words">{a.value}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const sheetInput =
  "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)";

/** Seller hands over the work: a message plus uploaded files and/or links. */
function DeliverSheet({
  requireWork,
  busy,
  onClose,
  onSubmit,
}: {
  /** Service orders must hand over something; a plain deal may just confirm. */
  requireWork: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (message: string, attachments: string[]) => void;
}) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [links, setLinks] = useState("");
  const [uploading, setUploading] = useState(false);

  const add = async (list: FileList) => {
    setUploading(true);
    try {
      for (const f of Array.from(list).slice(0, 10 - files.length)) {
        // Private prefix — only the buyer, seller and a mediating admin can open it.
        const url = await uploadUserFile(f, "marketplace", { purpose: "deliverable" });
        setFiles((prev) => [...prev, url]);
      }
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    const linkList = links
      .split(/\s+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const bad = linkList.find((l) => !/^https?:\/\/\S+$/i.test(l));
    if (bad) return toast.error(`Not a valid link: ${bad}`);
    const attachments = [...files, ...linkList].slice(0, 10);
    if (requireWork && !message.trim() && attachments.length === 0) {
      return toast.error("Add a message, a file or a link");
    }
    onSubmit(message.trim(), attachments);
  };

  return (
    <BottomSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Deliver your work"
      description="The buyer can accept it (which releases the payment) or request a revision."
      footer={
        <button
          onClick={submit}
          disabled={busy || uploading}
          className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl bg-(--app-cta) text-(--app-on-cta) text-sm font-bold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
          Deliver
        </button>
      }
    >
      <div className="space-y-3 px-5 py-4 overflow-y-auto max-h-[60vh]">
        <textarea
          rows={4}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe what you delivered…"
          className={cn(sheetInput, "resize-none")}
        />
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={f} className="flex items-center gap-2 text-xs text-(--app-ink-2)">
                <Paperclip className="w-3 h-3 shrink-0" />
                <span className="truncate flex-1 min-w-0">{fileLabel(f)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="text-(--app-ink-3) hover:text-rose-300"
                  aria-label="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {files.length < 10 && (
          <label className="flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-white/10 hover:border-(--app-accent-edge)/50 cursor-pointer text-sm text-(--app-ink-2)">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Uploading…" : "Attach files"}
            <input
              type="file"
              hidden
              multiple
              onChange={(e) => {
                if (e.target.files) add(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </label>
        )}
        <textarea
          rows={2}
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          placeholder="Links (optional, one per line) — e.g. a Google Drive folder"
          className={cn(sheetInput, "resize-none")}
        />
      </div>
    </BottomSheet>
  );
}

/** Buyer sends the delivery back with what to change. */
function RevisionSheet({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  return (
    <BottomSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Request a revision"
      description="The order goes back to the seller. Your payment stays in escrow."
      footer={
        <button
          onClick={() => {
            if (message.trim().length < 5) return toast.error("Tell the seller what to change");
            onSubmit(message.trim());
          }}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl bg-(--app-cta) text-(--app-on-cta) text-sm font-bold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Send revision request
        </button>
      }
    >
      <div className="px-5 py-4">
        <textarea
          rows={5}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What should the seller change?"
          className={cn(sheetInput, "resize-none")}
        />
      </div>
    </BottomSheet>
  );
}
