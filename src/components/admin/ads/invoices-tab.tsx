"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { usd } from "@/lib/utils";
import { ModalShell } from "@/components/admin/ads/modal-shell";

/**
 * Advertiser invoices — issue a bill, send it, mark it paid.
 *
 * Marking paid is the only action here that moves money: it credits the
 * advertiser's ad-credit balance and activates any slot booking the invoice
 * settles. It is safe to click twice — the ad-credit ledger is uniquely indexed
 * on its reference, so a replay credits nothing rather than doubling it.
 */

export interface InvoiceAdvertiser {
  id: string;
  email: string;
  name?: string | null;
}

interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitUsd: number;
  amountUsd: number;
  kind: string;
  refId: string | null;
}

interface InvoiceRow {
  id: string;
  number: string;
  kind: string;
  status: string;
  advertiserId: string;
  advertiser: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  paymentRef: string | null;
  subtotalUsd: number;
  discountUsd: number;
  taxPct: number;
  taxLabel: string | null;
  taxUsd: number;
  totalUsd: number;
  notes: string | null;
  lines: InvoiceLine[];
}

const STATUS_TONE: Record<string, string> = {
  PAID: "bg-emerald-500/15 text-emerald-400",
  SENT: "bg-amber-500/15 text-amber-400",
  DRAFT: "bg-slate-700 text-slate-300",
  VOID: "bg-red-500/15 text-red-400",
};

export function InvoicesTab({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/invoices");
      const d = await r.json();
      setRows(d.invoices ?? []);
    } catch {
      /* leave the list as it was rather than blanking it */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const settle = async (inv: InvoiceRow) => {
    const ok = await confirmDialog({
      title: `Mark ${inv.number} paid?`,
      description: `This credits ${usd(inv.totalUsd)} of ad credit to ${inv.advertiser} and activates any space booked on this invoice.`,
      confirmLabel: "Mark paid",
      tone: "info",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/invoices/${inv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "settle" }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(d.error ?? "Couldn't settle the invoice");
    } else {
      toast.success(
        d.creditedUsd > 0
          ? `Paid — ${usd(d.creditedUsd)} credited`
          : "Marked paid"
      );
    }
    void load();
  };

  const voidInvoice = async (inv: InvoiceRow) => {
    const ok = await confirmDialog({
      title: `Void ${inv.number}?`,
      description: "It stays on the list for the record but can no longer be paid.",
      confirmLabel: "Void",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/invoices/${inv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void" }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Couldn't void the invoice");
    }
    void load();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-sm text-blue-100/90">
        <b className="text-white">Billing a client.</b> Issue a bill, send them
        the PDF, and mark it paid when the money arrives. Marking it paid is what
        credits their ad balance and starts any space they booked — so nothing
        goes live before you have been paid. Self-serve top-ups get a receipt
        automatically.
      </div>

      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" /> New invoice
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-500 py-6 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">No invoices yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((inv) => (
            <div
              key={inv.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <button
                  onClick={() => setOpen(inv.id === open ? null : inv.id)}
                  className="min-w-0 text-left"
                >
                  <p className="text-sm font-semibold text-white truncate">
                    {inv.number}
                    <span className="text-slate-500"> · {inv.advertiser}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {inv.kind === "RECEIPT" ? "Receipt" : "Bill"} ·{" "}
                    {inv.issuedAt?.slice(0, 10) ?? "—"}
                    {inv.dueAt ? ` · due ${inv.dueAt.slice(0, 10)}` : ""}
                    {inv.paymentRef ? ` · ref ${inv.paymentRef}` : ""}
                  </p>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm font-bold text-white tabular-nums">
                    {usd(inv.totalUsd)}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_TONE[inv.status] ?? "bg-slate-700 text-slate-300"}`}
                  >
                    {inv.status}
                  </span>
                  <a
                    href={`/api/invoices/${inv.id}/pdf`}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Download PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  {canManage && (inv.status === "SENT" || inv.status === "DRAFT") && (
                    <>
                      <button
                        onClick={() => settle(inv)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                      >
                        Mark paid
                      </button>
                      <button
                        onClick={() => voidInvoice(inv)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] font-semibold"
                      >
                        Void
                      </button>
                    </>
                  )}
                </div>
              </div>

              {open === inv.id && (
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
                  {inv.lines.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-3 text-[11px]"
                    >
                      <span className="text-slate-300 truncate">
                        {l.description}
                        <span className="text-slate-600">
                          {" "}
                          · {l.kind.replace("_", " ").toLowerCase()}
                        </span>
                      </span>
                      <span className="text-slate-400 tabular-nums shrink-0">
                        {l.quantity} × {usd(l.unitUsd)} = {usd(l.amountUsd)}
                      </span>
                    </div>
                  ))}
                  <div className="pt-1.5 text-[11px] text-slate-400 tabular-nums text-right space-y-0.5">
                    <p>Subtotal {usd(inv.subtotalUsd)}</p>
                    {inv.discountUsd > 0 && <p>Discount −{usd(inv.discountUsd)}</p>}
                    {inv.taxPct > 0 && (
                      <p>
                        {inv.taxLabel ?? "Tax"} ({inv.taxPct}%) {usd(inv.taxUsd)}
                      </p>
                    )}
                    <p className="text-white font-bold">Total {usd(inv.totalUsd)}</p>
                  </div>
                  {inv.notes && (
                    <p className="text-[11px] text-slate-600 pt-1">{inv.notes}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <InvoiceModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

interface DraftLine {
  description: string;
  quantity: string;
  unitUsd: string;
  kind: string;
  refId: string;
}

function InvoiceModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { description: "Ad credit", quantity: "1", unitUsd: "", kind: "AD_CREDIT", refId: "" },
  ]);
  const [discount, setDiscount] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [paid, setPaid] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");
  const [busy, setBusy] = useState(false);

  const subtotal = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitUsd) || 0),
    0
  );

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const save = async () => {
    setBusy(true);
    try {
      // The email is resolved server-side: looking it up from here would need
      // `users.view`, which an ads-only admin does not have.
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advertiserEmail: email.trim(),
          lines: lines
            .filter((l) => l.description.trim() && Number(l.unitUsd) >= 0)
            .map((l) => ({
              description: l.description.trim(),
              quantity: Number(l.quantity) || 1,
              unitUsd: Number(l.unitUsd) || 0,
              kind: l.kind,
              refId: l.refId.trim() || undefined,
            })),
          discountUsd: Number(discount) || 0,
          dueAt: dueAt ? `${dueAt}T23:59:59.000Z` : null,
          notes: notes.trim() || null,
          paid,
          paymentRef: paymentRef.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error ?? "Couldn't issue the invoice");
        return;
      }
      toast.success(
        d.creditedUsd > 0
          ? `${d.invoice.number} issued — ${usd(d.creditedUsd)} credited`
          : `${d.invoice.number} issued`
      );
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm";

  return (
    <ModalShell title="New invoice" onClose={onClose} size="xl">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Advertiser email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            className={inputCls}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-slate-400">Lines</label>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input
                value={l.description}
                onChange={(e) => setLine(i, { description: e.target.value })}
                placeholder="What they are paying for"
                className={`${inputCls} col-span-5`}
              />
              <select
                value={l.kind}
                onChange={(e) => setLine(i, { kind: e.target.value })}
                className={`${inputCls} col-span-3`}
              >
                <option value="AD_CREDIT">Ad credit</option>
                <option value="SLOT_RENTAL">Slot rental</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
              <input
                type="number"
                min={0}
                value={l.quantity}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
                className={`${inputCls} col-span-2`}
              />
              <input
                type="number"
                min={0}
                value={l.unitUsd}
                onChange={(e) => setLine(i, { unitUsd: e.target.value })}
                placeholder="$"
                className={`${inputCls} col-span-2`}
              />
              {l.kind === "SLOT_RENTAL" && (
                <input
                  value={l.refId}
                  onChange={(e) => setLine(i, { refId: e.target.value })}
                  placeholder="Booking id this line pays for"
                  className={`${inputCls} col-span-12`}
                />
              )}
            </div>
          ))}
          <button
            onClick={() =>
              setLines((p) => [
                ...p,
                { description: "", quantity: "1", unitUsd: "", kind: "AD_CREDIT", refId: "" },
              ])
            }
            className="text-[11px] font-bold text-blue-400 hover:text-blue-300"
          >
            + Add line
          </button>
          <p className="text-[11px] text-slate-500">
            <b>Ad credit</b> tops up their balance when you mark it paid.{" "}
            <b>Slot rental</b> activates the booking you name. <b>Adjustment</b>{" "}
            moves nothing — for a discount, correction or note.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Discount ($)</label>
            <input
              type="number"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Due date</label>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <p className="text-right text-sm text-slate-300">
          Subtotal <b className="text-white tabular-nums">{usd(subtotal)}</b>
          <span className="block text-[11px] text-slate-500">
            Tax is added from your billing settings, if any.
          </span>
        </p>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
            placeholder="Bank details, terms, anything the client should read"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={paid}
            onChange={(e) => setPaid(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            They have already paid
            <span className="block text-[11px] text-slate-500">
              Issues it as a receipt AND credits them straight away — use this
              when the money has already reached you.
            </span>
          </span>
        </label>

        {paid && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Payment reference
            </label>
            <input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              className={inputCls}
              placeholder="bKash TrxID, bank ref…"
            />
          </div>
        )}

        <button
          onClick={save}
          disabled={busy || !email.trim() || subtotal <= 0}
          className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Issue invoice"}
        </button>
      </div>
    </ModalShell>
  );
}
