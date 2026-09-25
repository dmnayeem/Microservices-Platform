"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Loader2, RefreshCw, Repeat } from "lucide-react";
import { toast } from "@/lib/toast";
import { ENTRY_KIND_LABEL, TAX_LABELS, periodLabel, type EntryKind } from "@/lib/company-finance/constants";
import { api, btnGhost, btnPrimary, cardCls, Empty, Field, inputCls, Loading, Modal, money, thisMonth, type Meta } from "./ui";

type Recurring = {
  id: string;
  kind: string;
  categoryId: string;
  category: { id: string; name: string; color: string | null };
  employeeId: string | null;
  employee: { id: string; name: string } | null;
  payeeId: string | null;
  payee: { id: string; name: string } | null;
  title: string;
  amount: number;
  currency: string;
  taxAmount: number;
  taxLabel: string | null;
  dueDay: number;
  startPeriod: string;
  endPeriod: string | null;
  isActive: boolean;
  lastPeriod: string | null;
  notes: string | null;
};

/**
 * Bills that come back every month. The scheduler writes each month's entry as
 * PENDING on its own; paying it stays a person's decision.
 */
export function RecurringTab({ meta, onChanged }: { meta: Meta; onChanged?: () => void }) {
  const [rows, setRows] = useState<Recurring[] | null>(null);
  const [editing, setEditing] = useState<Recurring | "new" | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ recurring: Recurring[] }>("/api/admin/company-finance/recurring")).recurring);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setRunning(true);
    try {
      const r = await api<{ message: string }>("/api/admin/company-finance/recurring", {
        method: "POST",
        body: JSON.stringify({ generate: true }),
      });
      toast.success(r.message);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-400">
          Rent, internet, servers, a retainer — set them up once. Each month&apos;s entry appears as
          <span className="text-amber-300"> pending</span> by itself, ready to be paid. Nothing ever pays itself.
        </p>
        {meta.can.settings && (
          <div className="flex gap-2">
            <button className={btnGhost} onClick={generate} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Write this month now
            </button>
            <button className={btnPrimary} onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> New recurring
            </button>
          </div>
        )}
      </div>

      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>Nothing recurring yet. Office rent is the usual first one.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.id} className={`${cardCls} p-4 ${r.isActive ? "" : "opacity-50"}`}>
              <div className="flex items-start gap-3">
                <Repeat className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{r.title}</p>
                  <p className="text-xs text-slate-400">
                    {r.category.name}
                    {(r.payee?.name ?? r.employee?.name) && ` · ${r.payee?.name ?? r.employee?.name}`}
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-white">
                    {money(r.amount, r.currency, meta.currencies)}
                    <span className="ml-1 text-xs font-normal text-slate-500">monthly, due on the {r.dueDay}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    From {periodLabel(r.startPeriod)}
                    {r.endPeriod ? ` to ${periodLabel(r.endPeriod)}` : ", open-ended"}
                    {r.lastPeriod && ` · last written ${periodLabel(r.lastPeriod)}`}
                    {!r.isActive && " · stopped"}
                  </p>
                </div>
                {meta.can.settings && (
                  <button className={btnGhost} onClick={() => setEditing(r)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <RecurringForm
          meta={meta}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function RecurringForm({
  meta,
  row,
  onClose,
  onSaved,
}: {
  meta: Meta;
  row: Recurring | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [f, setF] = useState({
    kind: row?.kind ?? "EXPENSE",
    categoryId: row?.categoryId ?? "",
    paidTo: row?.employeeId ? "employee" : row?.payeeId ? "payee" : "none",
    employeeId: row?.employeeId ?? "",
    payeeId: row?.payeeId ?? "",
    title: row?.title ?? "",
    amount: row ? String(row.amount) : "",
    currency: row?.currency ?? meta.defaultCurrency,
    taxAmount: row && row.taxAmount > 0 ? String(row.taxAmount) : "",
    taxLabel: row?.taxLabel ?? "",
    dueDay: row ? String(row.dueDay) : "1",
    startPeriod: row?.startPeriod ?? thisMonth(),
    endPeriod: row?.endPeriod ?? "",
    isActive: row?.isActive ?? true,
    notes: row?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const cats = meta.categories.filter((c) => c.kind === f.kind && c.isActive);
  const s = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (!cats.some((c) => c.id === f.categoryId)) setF((x) => ({ ...x, categoryId: cats[0]?.id ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.kind]);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        kind: f.kind,
        categoryId: f.categoryId,
        employeeId: f.paidTo === "employee" ? f.employeeId || null : null,
        payeeId: f.paidTo === "payee" ? f.payeeId || null : null,
        title: f.title,
        amount: Number(f.amount) || 0,
        currency: f.currency,
        taxAmount: Number(f.taxAmount) || 0,
        taxLabel: f.taxLabel || null,
        dueDay: Number(f.dueDay) || 1,
        startPeriod: f.startPeriod,
        endPeriod: f.endPeriod || null,
        isActive: f.isActive,
        notes: f.notes || null,
      };
      if (row) await api(`/api/admin/company-finance/recurring/${row.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api(`/api/admin/company-finance/recurring`, { method: "POST", body: JSON.stringify(body) });
      toast.success(row ? "Saved" : "Recurring cost set up");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={row ? "Edit recurring" : "New recurring cost"} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select className={inputCls} value={f.kind} onChange={s("kind")}>
              {(Object.keys(ENTRY_KIND_LABEL) as EntryKind[]).map((k) => (
                <option key={k} value={k}>{ENTRY_KIND_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select className={inputCls} value={f.categoryId} onChange={s("categoryId")}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Title" className="sm:col-span-2">
            <input className={inputCls} value={f.title} onChange={s("title")} placeholder="Office rent — Gulshan" />
          </Field>
          <Field label="Paid to">
            <select className={inputCls} value={f.paidTo} onChange={s("paidTo")}>
              <option value="none">Nobody specific</option>
              <option value="payee">A payee</option>
              {meta.can.hrView && <option value="employee">An employee</option>}
            </select>
          </Field>
          {f.paidTo === "payee" ? (
            <Field label="Payee">
              <select className={inputCls} value={f.payeeId} onChange={s("payeeId")}>
                <option value="">Choose…</option>
                {meta.payees.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          ) : f.paidTo === "employee" ? (
            <Field label="Employee">
              <select className={inputCls} value={f.employeeId} onChange={s("employeeId")}>
                <option value="">Choose…</option>
                {meta.employees.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}
          <Field label="Amount each month">
            <div className="flex gap-2">
              <input className={inputCls} type="number" min={0} step="0.01" value={f.amount} onChange={s("amount")} />
              <select className={`${inputCls} w-28`} value={f.currency} onChange={s("currency")}>
                {meta.currencies.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Of which tax">
            <div className="flex gap-2">
              <input className={inputCls} type="number" min={0} step="0.01" value={f.taxAmount} onChange={s("taxAmount")} placeholder="0" />
              <input list="rec-tax" className={`${inputCls} w-36`} value={f.taxLabel} onChange={s("taxLabel")} placeholder="VAT" />
              <datalist id="rec-tax">
                {TAX_LABELS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </Field>
          <Field label="Due on day" hint="1–28, so every month has it.">
            <input className={inputCls} type="number" min={1} max={28} value={f.dueDay} onChange={s("dueDay")} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="First month"><input className={inputCls} type="month" value={f.startPeriod} onChange={s("startPeriod")} /></Field>
            <Field label="Last month" hint="Blank = ongoing"><input className={inputCls} type="month" value={f.endPeriod} onChange={s("endPeriod")} /></Field>
          </div>
          <Field label="Notes" className="sm:col-span-2"><textarea className={inputCls} rows={2} value={f.notes} onChange={s("notes")} /></Field>
        </div>
        {row && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
            Active — keep writing it each month
          </label>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={saving || !f.categoryId}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {row ? "Save" : "Set up"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
