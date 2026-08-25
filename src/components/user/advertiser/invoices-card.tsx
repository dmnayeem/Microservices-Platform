"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Receipt } from "lucide-react";
import { toast } from "@/lib/toast";
import { usd } from "@/lib/utils";

/**
 * The advertiser's own invoices, and the details they are addressed to.
 *
 * Renders nothing until there is either a document or a reason to fill in a
 * billing address — an empty card on a dashboard is just noise.
 *
 * Editing the billing details never changes an invoice that already exists:
 * each one carries a frozen copy taken when it was issued, so a document
 * somebody already downloaded cannot change underneath them.
 */

interface InvoiceRow {
  id: string;
  number: string;
  kind: string;
  status: string;
  issuedAt: string | null;
  dueAt: string | null;
  totalUsd: number;
  pdfUrl: string;
}

interface Profile {
  orgName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

const STATUS_TONE: Record<string, string> = {
  PAID: "bg-emerald-500/15 text-emerald-400",
  SENT: "bg-amber-500/15 text-amber-400",
  VOID: "bg-red-500/15 text-red-400",
};

export function InvoicesCard() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Profile>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [iRes, pRes] = await Promise.all([
        fetch("/api/advertiser/invoices"),
        fetch("/api/advertiser/billing-profile"),
      ]);
      const i = await iRes.json().catch(() => ({}));
      const p = await pRes.json().catch(() => ({}));
      setRows(i.invoices ?? []);
      setProfile(p.profile ?? null);
      setDraft(p.profile ?? {});
    } catch {
      /* a billing card must never break the dashboard around it */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/advertiser/billing-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error ?? "Couldn't save your billing details");
        return;
      }
      setProfile(d.profile);
      setEditing(false);
      toast.success("Billing details saved");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded || (rows.length === 0 && !profile && !editing)) {
    // Nothing to show yet — offer the address form only, and quietly.
    return loaded ? (
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-gray-400" /> Invoices
          </p>
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200"
          >
            Add billing details
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          Invoices and receipts appear here. Add your company name and address so
          they are addressed correctly.
        </p>
      </div>
    ) : null;
  }

  const field = (
    key: keyof Profile,
    label: string,
    placeholder = ""
  ) => (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1">{label}</label>
      <input
        value={(draft[key] as string) ?? ""}
        placeholder={placeholder}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm placeholder:text-gray-600"
      />
    </div>
  );

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold text-white flex items-center gap-1.5">
          <Receipt className="w-4 h-4 text-gray-400" /> Invoices
        </p>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200"
        >
          {editing ? "Cancel" : profile ? "Edit billing details" : "Add billing details"}
        </button>
      </div>

      {editing && (
        <div className="space-y-2 rounded-xl bg-black/20 p-3">
          <p className="text-[11px] text-gray-500">
            These go on future invoices. Documents already issued keep the details
            they were issued with.
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {field("orgName", "Company name", "Acme Ltd")}
            {field("taxId", "Tax / BIN number")}
            {field("email", "Billing email")}
            {field("phone", "Phone")}
            {field("addressLine1", "Address")}
            {field("addressLine2", "Address line 2")}
            {field("city", "City")}
            {field("postalCode", "Post code")}
            {field("country", "Country", "BD")}
          </div>
          <button
            onClick={save}
            disabled={busy}
            className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save billing details"}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-[11px] text-gray-500">No invoices yet.</p>
      ) : (
        <ul className="divide-y divide-white/5 rounded-xl bg-black/20">
          {rows.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-gray-200 truncate">
                  {inv.number}
                  <span className="text-gray-500">
                    {" "}
                    · {inv.kind === "RECEIPT" ? "Receipt" : "Bill"}
                  </span>
                </p>
                <p className="text-[10px] text-gray-500">
                  {inv.issuedAt?.slice(0, 10) ?? "—"}
                  {inv.status !== "PAID" && inv.dueAt
                    ? ` · due ${inv.dueAt.slice(0, 10)}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-bold text-white tabular-nums">
                  {usd(inv.totalUsd)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${STATUS_TONE[inv.status] ?? "bg-gray-800 text-gray-300"}`}
                >
                  {inv.status}
                </span>
                <a
                  href={inv.pdfUrl}
                  className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                  title="Download PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
