"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, MessageSquare, Send, X } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * Buyer-side dispute entry point on an order: open a dispute (inside the
 * admin-set window) or follow an existing one as a simple message thread.
 * Uses the existing /api/marketplace/disputes endpoints — there was no UI for
 * them at all, so a buyer had no way to raise a problem with an order.
 */

const REASONS: Array<{ value: string; label: string }> = [
  { value: "ITEM_NOT_RECEIVED", label: "I didn't receive it" },
  { value: "ITEM_NOT_AS_DESCRIBED", label: "Not as described" },
  { value: "QUALITY_ISSUE", label: "Quality problem" },
  { value: "SELLER_UNRESPONSIVE", label: "Seller isn't responding" },
  { value: "PAYMENT_ISSUE", label: "Payment problem" },
  { value: "OTHER", label: "Something else" },
];

const CLOSED = ["CLOSED", "RESOLVED_BUYER", "RESOLVED_SELLER"];

interface ThreadMessage {
  id: string;
  sender: { name: string; type: string };
  message: string;
  createdAt: string;
  isMe: boolean;
}

interface Props {
  purchaseId: string;
  /** Latest dispute on this order, if any. */
  dispute: { id: string; status: string } | null;
  /** Still inside the dispute window. */
  canOpen: boolean;
  windowDays: number;
}

export function OrderDispute({ purchaseId, dispute, canOpen, windowDays }: Props) {
  const [current, setCurrent] = useState(dispute);
  const [mode, setMode] = useState<"closed" | "form" | "thread">("closed");
  const [reason, setReason] = useState(REASONS[0].value);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [status, setStatus] = useState(dispute?.status ?? null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const active = current && !CLOSED.includes(status ?? current.status);

  const load = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/marketplace/disputes/${id}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setMessages(d.messages as ThreadMessage[]);
      setStatus(d.dispute?.status ?? null);
      setResolution(d.dispute?.resolution ?? null);
    } catch (e) {
      toast.error("Couldn't load the dispute", {
        description: e instanceof Error ? e.message : "Try again",
      });
    }
  }, []);

  useEffect(() => {
    if (mode === "thread" && current) void load(current.id);
  }, [mode, current, load]);

  const open = async () => {
    if (description.trim().length < 10) {
      toast.error("Describe the problem in at least 10 characters");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/marketplace/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId, reason, description: description.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Dispute opened — the seller has been notified");
      setCurrent({ id: d.dispute.id, status: d.dispute.status });
      setStatus(d.dispute.status);
      setDescription("");
      setMode("thread");
    } catch (e) {
      toast.error("Couldn't open the dispute", {
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!current || !draft.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/marketplace/disputes/${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: draft.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setMessages((m) => [...(m ?? []), d.message as ThreadMessage]);
      setDraft("");
    } catch (e) {
      toast.error("Message not sent", {
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const chip =
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50";

  if (mode === "closed") {
    if (current) {
      return (
        <button
          type="button"
          onClick={() => setMode("thread")}
          className={`${chip} bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {active ? "View dispute" : "Dispute closed"} · {(status ?? current.status).replace(/_/g, " ").toLowerCase()}
        </button>
      );
    }
    if (!canOpen) return null;
    return (
      <button
        type="button"
        onClick={() => setMode("form")}
        className={`${chip} bg-(--app-surface-2) text-(--app-ink-2) border border-(--app-line) hover:bg-(--app-surface-hover)`}
        title={`You can open a dispute within ${windowDays} days of buying`}
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        Report a problem
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-(--app-line) bg-(--app-surface) p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-white inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
          {mode === "form" ? "Open a dispute" : "Dispute"}
          {mode === "thread" && status && (
            <span className="text-[10px] uppercase tracking-wider text-(--app-ink-3)">
              · {status.replace(/_/g, " ")}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setMode("closed")}
          aria-label="Close"
          className="p-1 rounded-md text-(--app-ink-3) hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {mode === "form" ? (
        <>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-(--app-page) border border-(--app-line) rounded-lg px-3 py-2 text-sm text-white"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="What went wrong? The seller and our team will see this."
            className="w-full bg-(--app-page) border border-(--app-line) rounded-lg px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            onClick={open}
            disabled={busy}
            className={`${chip} bg-amber-600 text-white hover:bg-amber-500`}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Open dispute
          </button>
        </>
      ) : (
        <>
          {messages === null ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-(--app-ink-3)" />
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={
                    "rounded-lg px-3 py-2 text-xs " +
                    (m.isMe
                      ? "bg-(--app-cta)/15 text-white ml-6"
                      : m.sender.type === "SYSTEM"
                      ? "bg-(--app-surface-2) text-(--app-ink-3) italic"
                      : "bg-(--app-surface-2) text-(--app-ink) mr-6")
                  }
                >
                  <p className="text-[10px] font-bold text-(--app-ink-3) mb-0.5">
                    {m.isMe ? "You" : m.sender.name} ·{" "}
                    {new Date(m.createdAt).toLocaleString()}
                  </p>
                  <p className="whitespace-pre-wrap wrap-break-word">{m.message}</p>
                </li>
              ))}
            </ul>
          )}
          {resolution && (
            <p className="text-xs text-emerald-300">Resolution: {resolution}</p>
          )}
          {active && (
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={5000}
                placeholder="Add a message…"
                className="flex-1 bg-(--app-page) border border-(--app-line) rounded-lg px-3 py-2 text-sm text-white"
              />
              <button
                type="button"
                onClick={send}
                disabled={busy || !draft.trim()}
                aria-label="Send"
                className={`${chip} bg-(--app-cta) text-(--app-on-cta)`}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
