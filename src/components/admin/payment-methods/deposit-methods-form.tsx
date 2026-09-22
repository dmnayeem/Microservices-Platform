"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import type { DepositMethod } from "@/lib/deposit-methods";
import { qrPayloadKind } from "@/lib/deposit-qr";

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
            {/* Crypto-only, and the pair that loses money when wrong: the
              * chain the transfer must go over, and the memo some exchanges
              * need to attribute it. Left blank for every non-crypto method,
              * where neither line is shown to the user at all. */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Network (crypto only — e.g. TRC20)">
                <input value={m.network ?? ""} onChange={(e) => update(i, { network: e.target.value })} disabled={!canEdit} placeholder="TRC20 (Tron) / BEP20 (BSC)" className={inp} />
              </Field>
              <Field label="Memo / Tag (only if required)">
                <input value={m.memo ?? ""} onChange={(e) => update(i, { memo: e.target.value })} disabled={!canEdit} placeholder="Leave empty unless the wallet asks for one" className={inp} />
              </Field>
            </div>
            <Field label="QR code">
              <label className="flex items-start gap-2 text-xs text-gray-300 mb-2">
                <input
                  type="checkbox"
                  checked={m.autoQr === true}
                  onChange={(e) => update(i, { autoQr: e.target.checked })}
                  disabled={!canEdit}
                  className="mt-0.5"
                />
                <span>
                  Generate the QR from the receiving account above
                  <span className="block text-[11px] text-gray-500">
                    For wallet addresses only. It always matches the account —
                    an uploaded image keeps pointing at the old wallet after
                    you change the address here.
                  </span>
                </span>
              </label>
              {/* The account decides whether generating is even possible. A
                * user scans this QR inside their wallet app at the moment of
                * paying; a QR of a UID or a phone number scans to that text
                * and the app does nothing, which reads to the payer as a
                * broken site. So the check is on what the account IS, not on
                * what the admin intended. */}
              {m.autoQr && qrPayloadKind(m.account) === "plain" && m.account.trim() && (
                <p className="text-[11px] text-amber-300 mb-2">
                  <b>{m.accountLabel || "This account"}</b> is not a wallet
                  address, so a generated QR would scan to just that text and
                  the payer&apos;s app would do nothing. Upload the QR from the
                  provider&apos;s own app instead — Bitget: Pay → Receive ·
                  bKash / Nagad: My QR · Binance: Pay → Receive.
                </p>
              )}
              <ImageUploadField value={m.qrUrl ?? ""} onChange={(url) => update(i, { qrUrl: url })} previewSize="square" title="Payment QR code" />
              {m.qrUrl && m.autoQr && (
                <p className="text-[11px] text-amber-300 mt-1">
                  An uploaded image is set, so it is used instead of the
                  generated one. Remove it to use the generated QR.
                </p>
              )}
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
            {/* The second kind of fee. A network fee costs the same on a $5
              * transfer as on a $5,000 one, so a percentage either overstates
              * it or hides it. Quoted in USD because that is what the chain
              * charges in; the user's screen converts it. */}
            <Field label="Flat fee ($ — crypto network fee)">
              <input
                type="number"
                step={0.01}
                min={0}
                value={m.feeFlatUsd ?? 0}
                onChange={(e) => update(i, { feeFlatUsd: parseFloat(e.target.value) || 0 })}
                disabled={!canEdit}
                className={inp}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Added on top of the amount, alongside any percentage above. The
                user&apos;s wallet is still credited the amount they entered.
                Leave 0 for methods with no fixed cost.
              </p>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Charge type">
                <select
                  value={m.chargeType ?? "none"}
                  onChange={(e) =>
                    update(i, {
                      chargeType: e.target.value as DepositMethod["chargeType"],
                    })
                  }
                  disabled={!canEdit}
                  className={inp}
                >
                  <option value="none">No charge</option>
                  <option value="personal">Personal (add charge)</option>
                  <option value="cashout">Cash out (no charge)</option>
                </select>
              </Field>
              <Field label="Charge (%) — for Personal">
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  value={m.chargePct ?? 0}
                  onChange={(e) => update(i, { chargePct: parseFloat(e.target.value) || 0 })}
                  disabled={!canEdit || m.chargeType !== "personal"}
                  placeholder="e.g. 1.85"
                  className={inp}
                />
                {m.chargeType === "personal" && (m.chargePct ?? 0) > 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    ≈ ৳{((m.chargePct ?? 0) * 10).toFixed(1)} per ৳1,000 (scales with amount)
                  </p>
                )}
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
