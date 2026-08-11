"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2,
  Send,
  ShieldCheck,
  ChevronLeft,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Handshake,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/user/primitives/avatar";

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
  senderType: "USER" | "ADMIN" | "SYSTEM";
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
    listing: { id: string; title: string; price: number; status: string } | null;
    mediation: { enabled: boolean; feeBps: number };
  };
  messages: Message[];
  deals: Deal[];
}

const TERMINAL: DealStatus[] = ["RELEASED", "REFUNDED", "CANCELLED"];
const STATUS_STYLE: Record<DealStatus, string> = {
  PROPOSED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  FUNDED: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  DELIVERED: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  RELEASED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  REFUNDED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  CANCELLED: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  DISPUTED: "bg-red-500/15 text-red-300 border-red-500/30",
};

export function DealThreadView({ threadId, viewerId }: { threadId: string; viewerId: string }) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
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
    const t = setInterval(() => load(true), 8000);
    return () => clearInterval(t);
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

  const runAction = async (url: string, action: string, reason?: string) => {
    setActionBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Action failed");
      toast.success("Done");
      await load(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionBusy(false);
    }
  };
  const dealAction = (dealId: string, action: string, reason?: string) =>
    runAction(`/api/marketplace/deals/${dealId}`, action, reason);
  const adminAction = (dealId: string, action: string, reason?: string) =>
    runAction(`/api/admin/marketplace/deals/${dealId}`, action, reason);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
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
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
      >
        <ChevronLeft className="w-4 h-4" /> All messages
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-4">
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
                  href={`/marketplace/${thread.listing.id}`}
                  className="text-xs text-gray-400 hover:text-white truncate block"
                >
                  {thread.listing.title}
                </Link>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((m) => {
              if (m.senderType === "SYSTEM") {
                return (
                  <div key={m.id} className="text-center my-2">
                    <span className="inline-block text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
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
                        ? "bg-indigo-600 text-white"
                        : "bg-white/10 text-gray-100"
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
              <p className="text-center text-sm text-gray-500 py-8">
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
              className="flex-1 resize-none bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 max-h-32"
            />
            <button
              onClick={send}
              disabled={sending || !text.trim()}
              className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Deal panel */}
        <div className="glass rounded-2xl p-4 space-y-3 h-max">
          <div className="flex items-center gap-2">
            <Handshake className="w-4 h-4 text-indigo-300" />
            <h3 className="text-sm font-bold text-white">Escrow deal</h3>
          </div>

          {activeDeal ? (
            <DealActions
              deal={activeDeal}
              role={role}
              viewerId={viewerId}
              busy={actionBusy}
              onAction={dealAction}
              onAdminAction={adminAction}
            />
          ) : (
            <>
              {lastTerminal && (
                <div className="text-xs text-gray-400">
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
                <p className="text-xs text-gray-500">No active deal to mediate.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DealActions({
  deal,
  role,
  viewerId,
  busy,
  onAction,
  onAdminAction,
}: {
  deal: Deal;
  role: Role;
  viewerId: string;
  busy: boolean;
  onAction: (dealId: string, action: string, reason?: string) => void;
  onAdminAction: (dealId: string, action: string, reason?: string) => void;
}) {
  const isBuyer = role === "BUYER";
  const isSeller = role === "SELLER";
  const isAdmin = role === "ADMIN";
  const btn =
    "w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold disabled:opacity-50";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-lg font-extrabold text-white">${deal.amount.toFixed(2)}</span>
        <span className={cn("px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider", STATUS_STYLE[deal.status])}>
          {deal.status}
        </span>
      </div>
      {deal.adminMediated && (
        <p className="text-[11px] text-amber-300 inline-flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" /> Admin-mediated · fee ${deal.adminFee.toFixed(2)}
        </p>
      )}
      {deal.status === "FUNDED" && (
        <p className="text-[11px] text-gray-400 inline-flex items-center gap-1">
          <Lock className="w-3.5 h-3.5" /> ${deal.heldAmount.toFixed(2)} held in escrow
        </p>
      )}
      {deal.status === "DELIVERED" && deal.autoReleaseAt && (
        <p className="text-[11px] text-gray-400">
          Auto-releases {formatDistanceToNow(new Date(deal.autoReleaseAt), { addSuffix: true })}
        </p>
      )}

      {/* Contextual actions */}
      {deal.status === "PROPOSED" && (
        <div className="space-y-2">
          {isBuyer && (
            <button disabled={busy} onClick={() => onAction(deal.id, "fund")} className={cn(btn, "bg-indigo-600 text-white hover:bg-indigo-700")}>
              Fund escrow ${(deal.amount + deal.adminFee).toFixed(2)}
            </button>
          )}
          {(isBuyer || isSeller) && (
            <button disabled={busy} onClick={() => onAction(deal.id, "cancel")} className={cn(btn, "bg-white/10 text-gray-200 hover:bg-white/20")}>
              Cancel
            </button>
          )}
          {isSeller && <p className="text-[11px] text-gray-500">Waiting for the buyer to fund.</p>}
        </div>
      )}

      {deal.status === "FUNDED" && (
        <div className="space-y-2">
          {isSeller && (
            <button disabled={busy} onClick={() => onAction(deal.id, "deliver")} className={cn(btn, "bg-indigo-600 text-white hover:bg-indigo-700")}>
              <CheckCircle2 className="w-4 h-4" /> Mark delivered
            </button>
          )}
          {isSeller && (
            <button disabled={busy} onClick={() => onAction(deal.id, "refund")} className={cn(btn, "bg-white/10 text-gray-200 hover:bg-white/20")}>
              Refund buyer
            </button>
          )}
          {isBuyer && <p className="text-[11px] text-gray-500">Funds are held — waiting for delivery.</p>}
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
              <CheckCircle2 className="w-4 h-4" /> Confirm & release
            </button>
          )}
          {isSeller && <p className="text-[11px] text-gray-500">Delivered — waiting for the buyer to confirm.</p>}
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
          <button disabled={busy} onClick={() => onAdminAction(deal.id, "assign")} className={cn(btn, "bg-white/10 text-gray-200 hover:bg-white/20")}>
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
        <p className="text-[10px] text-gray-500">You proposed this deal.</p>
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
      <p className="text-xs text-gray-400">
        Agree a price, then the buyer funds escrow. Funds release to the seller once delivery is confirmed.
      </p>
      <div>
        <label className="block text-[11px] text-gray-400 mb-1">Amount ($)</label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        />
      </div>
      {mediation.enabled && (
        <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={mediated}
            onChange={(e) => setMediated(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Admin-mediated deal
            <span className="block text-[10px] text-gray-500">
              A platform admin oversees the deal. Buyer pays a {(mediation.feeBps / 100).toFixed(2)}% fee
              {fee > 0 && ` (+$${fee.toFixed(2)})`}.
            </span>
          </span>
        </label>
      )}
      <button
        onClick={submit}
        disabled={busy || amt <= 0}
        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Handshake className="w-4 h-4" />}
        Propose deal
      </button>
    </div>
  );
}
