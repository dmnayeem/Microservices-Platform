"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Loader2, Building2, User, Globe } from "lucide-react";
import { toast } from "@/lib/toast";
import { PAYEE_KIND_LABEL, PAYEE_KINDS, PAYMENT_METHODS, type PayeeKind } from "@/lib/company-finance/constants";
import {
  api,
  btnGhost,
  btnPrimary,
  cardCls,
  CustomFieldInputs,
  Empty,
  Field,
  fieldsFor,
  inputCls,
  Loading,
  Modal,
  type Meta,
} from "./ui";

type Payee = {
  id: string;
  kind: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentMethod: string | null;
  paymentDetails: string | null;
  taxId: string | null;
  notes: string | null;
  customFields: Record<string, string> | null;
  isActive: boolean;
  _count?: { entries: number };
};

const ICON = { COMPANY: Building2, PERSON: User, PLATFORM: Globe } as const;

export function PayeesTab({ meta, onChanged }: { meta: Meta; onChanged?: () => void }) {
  const [rows, setRows] = useState<Payee[] | null>(null);
  const [editing, setEditing] = useState<Payee | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ payees: Payee[] }>("/api/admin/company-finance/payees")).payees);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load payees");
    }
  }, []);
  useEffect(() => {
    let alive = true;
    api<{ payees: Payee[] }>("/api/admin/company-finance/payees")
      .then((r) => alive && setRows(r.payees))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load payees"));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          Companies, people and platforms the company pays — the landlord, the ISP, AWS, a freelancer.
        </p>
        {meta.can.create && (
          <button className={btnPrimary} onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add payee
          </button>
        )}
      </div>

      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No payees yet.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const Icon = ICON[p.kind as keyof typeof ICON] ?? Building2;
            return (
              <div key={p.id} className={`${cardCls} p-4 ${p.isActive ? "" : "opacity-50"}`}>
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{p.name}</p>
                    <p className="text-xs text-slate-400">
                      {PAYEE_KIND_LABEL[p.kind as PayeeKind]}
                      {p._count ? ` · ${p._count.entries} entr${p._count.entries === 1 ? "y" : "ies"}` : ""}
                      {!p.isActive && " · inactive"}
                    </p>
                    {p.paymentMethod && (
                      <p className="mt-1 truncate text-[11px] text-slate-500">
                        {p.paymentMethod}
                        {p.paymentDetails && ` · ${p.paymentDetails}`}
                      </p>
                    )}
                  </div>
                  {meta.can.create && (
                    <button className={btnGhost} onClick={() => setEditing(p)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <PayeeForm
          meta={meta}
          payee={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function PayeeForm({
  meta,
  payee,
  onClose,
  onSaved,
}: {
  meta: Meta;
  payee: Payee | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [f, setF] = useState({
    kind: payee?.kind ?? "COMPANY",
    name: payee?.name ?? "",
    contactName: payee?.contactName ?? "",
    phone: payee?.phone ?? "",
    email: payee?.email ?? "",
    address: payee?.address ?? "",
    paymentMethod: payee?.paymentMethod ?? "",
    paymentDetails: payee?.paymentDetails ?? "",
    taxId: payee?.taxId ?? "",
    notes: payee?.notes ?? "",
    isActive: payee?.isActive ?? true,
  });
  const [custom, setCustom] = useState<Record<string, string>>(payee?.customFields ?? {});
  const [saving, setSaving] = useState(false);
  const defs = fieldsFor(meta, "PAYEE");
  const s = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f, customFields: custom };
      if (payee) await api(`/api/admin/company-finance/payees/${payee.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api(`/api/admin/company-finance/payees`, { method: "POST", body: JSON.stringify(body) });
      toast.success(payee ? "Payee updated" : "Payee added");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={payee ? `Edit ${payee.name}` : "Add payee"} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex gap-1.5">
          {PAYEE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setF({ ...f, kind: k })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                f.kind === k ? "border-emerald-500 bg-emerald-500/15 text-emerald-200" : "border-slate-700 text-slate-400 hover:text-white"
              }`}
            >
              {PAYEE_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2"><input className={inputCls} value={f.name} onChange={s("name")} /></Field>
          <Field label="Contact person"><input className={inputCls} value={f.contactName} onChange={s("contactName")} /></Field>
          <Field label="Phone"><input className={inputCls} value={f.phone} onChange={s("phone")} /></Field>
          <Field label="Email"><input className={inputCls} value={f.email} onChange={s("email")} /></Field>
          <Field label="BIN / TIN / VAT no."><input className={inputCls} value={f.taxId} onChange={s("taxId")} /></Field>
          <Field label="Paid by">
            <input list="payee-methods" className={inputCls} value={f.paymentMethod} onChange={s("paymentMethod")} />
            <datalist id="payee-methods">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Account / bKash / IBAN" hint={payee ? "Changing this is logged by name — it is how payment diversion fraud works." : undefined}>
            <input className={inputCls} value={f.paymentDetails} onChange={s("paymentDetails")} />
          </Field>
          <Field label="Address" className="sm:col-span-2"><input className={inputCls} value={f.address} onChange={s("address")} /></Field>
          <Field label="Notes" className="sm:col-span-2"><textarea className={inputCls} rows={2} value={f.notes} onChange={s("notes")} /></Field>
        </div>
        {defs.length > 0 && <CustomFieldInputs defs={defs} values={custom} onChange={setCustom} />}
        {payee && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
            Active — offered when recording entries
          </label>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {payee ? "Save" : "Add payee"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
