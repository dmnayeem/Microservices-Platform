"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import type { DepositMethod } from "@/lib/deposit-methods";

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

export function DepositMethodsForm({
  initial,
  canEdit,
}: {
  initial: DepositMethod[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [methods, setMethods] = useState<DepositMethod[]>(initial);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<DepositMethod>) =>
    setMethods((p) => p.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const remove = (i: number) => setMethods((p) => p.filter((_, idx) => idx !== i));
  const add = () =>
    setMethods((p) => [
      ...p,
      { key: `custom-${p.length + 1}`, label: "New wallet", account: "", instructions: "", enabled: false, minAmount: 1, maxAmount: 100000 },
    ]);

  const save = async () => {
    // Ensure unique, non-empty keys (derive from label if missing).
    const seen = new Set<string>();
    const list = methods.map((m, i) => {
      let key = slug(m.key || m.label || `method-${i + 1}`) || `method-${i + 1}`;
      while (seen.has(key)) key = `${key}-${i}`;
      seen.add(key);
      return { ...m, key };
    });
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "payment_methods", settings: { deposit_methods: list } }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setMethods(list);
      toast.success("Deposit methods saved");
      router.refresh();
    } catch (err) {
      toast.error("Failed to save", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        A method only appears to users when it&apos;s <b>Active</b> and has a{" "}
        <b>receiving account</b>. Add a QR image and/or a pay link to make paying easier.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {methods.map((m, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border bg-slate-900 p-4 space-y-3",
              m.enabled && m.account.trim() ? "border-emerald-500/30" : "border-slate-800"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <input
                value={m.label}
                onChange={(e) => update(i, { label: e.target.value })}
                disabled={!canEdit}
                placeholder="Method name (e.g. Binance Pay)"
                className={inp + " font-semibold"}
              />
              <label className="flex items-center gap-1.5 shrink-0">
                <input type="checkbox" checked={m.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} disabled={!canEdit} className="rounded bg-slate-800 border-slate-600 text-emerald-500" />
                <span className="text-xs text-slate-400">Active</span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account label (what it is)">
                <input value={m.accountLabel ?? ""} onChange={(e) => update(i, { accountLabel: e.target.value })} disabled={!canEdit} placeholder="Binance UID / bKash number / PayPal email" className={inp} />
              </Field>
              <Field label="Pay link (optional)">
                <input value={m.payLink ?? ""} onChange={(e) => update(i, { payLink: e.target.value })} disabled={!canEdit} placeholder="https://paypal.me/… or Binance Pay link" className={inp} />
              </Field>
            </div>
            <Field label="Receiving account / address (shown to users)">
              <input value={m.account} onChange={(e) => update(i, { account: e.target.value })} disabled={!canEdit} placeholder="Binance UID / bKash number / PayPal email / wallet address" className={inp} />
            </Field>
            <Field label="QR code image (optional — users scan to pay)">
              <ImageUploadField value={m.qrUrl ?? ""} onChange={(url) => update(i, { qrUrl: url })} previewSize="square" title="Payment QR code" />
            </Field>
            <Field label="Instructions (how to pay)">
              <textarea rows={2} value={m.instructions} onChange={(e) => update(i, { instructions: e.target.value })} disabled={!canEdit} className={inp + " resize-none"} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min ($)">
                <input type="number" step={1} value={m.minAmount} onChange={(e) => update(i, { minAmount: parseFloat(e.target.value) || 0 })} disabled={!canEdit} className={inp} />
              </Field>
              <Field label="Max ($)">
                <input type="number" step={1} value={m.maxAmount} onChange={(e) => update(i, { maxAmount: parseFloat(e.target.value) || 0 })} disabled={!canEdit} className={inp} />
              </Field>
            </div>
            {canEdit && (
              <button onClick={() => remove(i)} className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="flex items-center gap-2">
          <button onClick={add} className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold">
            <Plus className="w-4 h-4" /> Add method
          </button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save deposit methods
          </button>
        </div>
      )}
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
