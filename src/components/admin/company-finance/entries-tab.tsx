"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Download, Search, Check, Ban, Pencil, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { promptDialog } from "@/lib/confirm";
import {
  ENTRY_KIND_LABEL,
  PAYMENT_METHODS,
  TAX_LABELS,
  periodLabel,
  type EntryKind,
} from "@/lib/company-finance/constants";
import {
  api,
  AttachmentLinks,
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
  money,
  Pill,
  ReceiptUpload,
  thisMonth,
  usdFmt,
  type Meta,
} from "./ui";

export type EntryRow = {
  id: string;
  kind: string;
  categoryId: string;
  category: { id: string; name: string; color: string | null; kind: string };
  employeeId: string | null;
  employee: { id: string; name: string } | null;
  payeeId: string | null;
  payee: { id: string; name: string } | null;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  usdRate: number;
  amountUsd: number;
  taxAmount: number;
  taxAmountUsd: number;
  taxLabel: string | null;
  period: string;
  dueDate: string | null;
  paidAt: string | null;
  status: string;
  paymentMethod: string | null;
  reference: string | null;
  attachments: string[];
  customFields: Record<string, string> | null;
  source: string;
  createdBy: { name: string | null } | null;
  approvedBy: { name: string | null } | null;
  voidReason: string | null;
};

type ListResp = {
  rows: EntryRow[];
  total: number;
  page: number;
  totals: { paidUsd: number; pendingUsd: number; taxUsd: number; paidCount: number; pendingCount: number };
};

export function EntriesTab({ meta, onChanged }: { meta: Meta; onChanged?: () => void }) {
  const [filters, setFilters] = useState({
    kind: "",
    status: "",
    categoryId: "",
    from: "",
    to: "",
    q: "",
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EntryRow | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    return p;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams(qs);
      p.set("page", String(page));
      setData(await api<ListResp>(`/api/admin/company-finance/entries?${p}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load entries");
    } finally {
      setLoading(false);
    }
  }, [qs, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (k: keyof typeof filters, v: string) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  const pay = async (row: EntryRow) => {
    setBusy(row.id);
    try {
      await api(`/api/admin/company-finance/entries/${row.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "pay" }),
      });
      toast.success(`"${row.title}" marked paid`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark it paid");
    } finally {
      setBusy(null);
    }
  };

  const voidIt = async (row: EntryRow) => {
    // A void with no reason is a deletion with extra steps — so it asks.
    const reason = await promptDialog({
      title: `Void "${row.title}"?`,
      description:
        row.status === "PAID"
          ? "It stays in the books, marked void, and stops counting. Record it again if it was entered wrong."
          : "It stays in the books, marked void, and stops counting.",
      placeholder: "Why is it being voided?",
      required: true,
      multiline: true,
      confirmLabel: "Void entry",
      tone: "danger",
    });
    if (!reason) return;
    setBusy(row.id);
    try {
      await api(`/api/admin/company-finance/entries/${row.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "void", reason }),
      });
      toast.success("Entry voided");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not void it");
    } finally {
      setBusy(null);
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Paid" value={usdFmt(data?.totals.paidUsd ?? 0)} note={`${data?.totals.paidCount ?? 0} entries`} tone="text-emerald-300" />
        <Stat label="Pending — owed, not paid" value={usdFmt(data?.totals.pendingUsd ?? 0)} note={`${data?.totals.pendingCount ?? 0} entries`} tone="text-amber-300" />
        <Stat label="Tax inside these" value={usdFmt(data?.totals.taxUsd ?? 0)} note="Kept out of costs — see the Tax tab" tone="text-sky-300" />
      </div>

      <div className={`${cardCls} p-3`}>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <div className="relative sm:col-span-3 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input className={`${inputCls} pl-9`} placeholder="Search title or reference" value={filters.q} onChange={(e) => set("q", e.target.value)} />
          </div>
          <select className={inputCls} value={filters.kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="">All types</option>
            {Object.entries(ENTRY_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className={inputCls} value={filters.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">Any status</option>
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>
          <select className={inputCls} value={filters.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">All categories</option>
            {meta.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="month" className={inputCls} value={filters.from} onChange={(e) => set("from", e.target.value)} title="From month" />
          <input type="month" className={inputCls} value={filters.to} onChange={(e) => set("to", e.target.value)} title="To month" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {meta.can.create && (
            <button className={btnPrimary} onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> New entry
            </button>
          )}
          <a className={btnGhost} href={`/api/admin/company-finance/export?${qs}`}>
            <Download className="h-4 w-4" /> Export CSV
          </a>
          {!meta.can.hrView && (
            <span className="text-[11px] text-slate-500">Salary rows are hidden — you do not have the salaries permission.</span>
          )}
        </div>
      </div>

      {loading && !data ? (
        <Loading />
      ) : !data || data.rows.length === 0 ? (
        <Empty>No entries match. {meta.can.create ? "Record the first bill with “New entry”." : ""}</Empty>
      ) : (
        <div className={`${cardCls} overflow-x-auto`}>
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2">Entry</th>
                <th className="px-3 py-2">Paid to</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Tax</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60 align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">{periodLabel(r.period)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.category.color ?? "#64748b" }} />
                      <span className="font-medium text-white">{r.title}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {r.category.name}
                      {r.kind !== "EXPENSE" && ` · ${ENTRY_KIND_LABEL[r.kind as EntryKind]}`}
                      {r.source !== "MANUAL" && ` · ${r.source.toLowerCase()}`}
                      {r.reference && ` · ref ${r.reference}`}
                    </div>
                    {r.voidReason && <div className="mt-0.5 text-[11px] text-rose-400">Void: {r.voidReason}</div>}
                    <div className="mt-1">
                      <AttachmentLinks items={r.attachments} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{r.employee?.name ?? r.payee?.name ?? <span className="text-slate-600">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <div className="font-semibold text-white">{money(r.amount, r.currency, meta.currencies)}</div>
                    {r.currency !== "USD" && <div className="text-[11px] text-slate-500">{usdFmt(r.amountUsd)}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-400">
                    {r.taxAmount > 0 ? (
                      <>
                        {money(r.taxAmount, r.currency, meta.currencies)}
                        <div className="text-[11px] text-slate-500">{r.taxLabel}</div>
                      </>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Pill value={r.status} />
                    {r.paidAt && <div className="mt-1 text-[11px] text-slate-500">{new Date(r.paidAt).toLocaleDateString()}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      {r.status === "PENDING" && meta.can.create && (
                        <IconBtn title="Edit" onClick={() => setEditing(r)} disabled={busy === r.id}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                      )}
                      {r.status === "PENDING" && meta.can.approve && (
                        <IconBtn title="Mark paid" onClick={() => pay(r)} disabled={busy === r.id} tone="emerald">
                          {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </IconBtn>
                      )}
                      {r.status !== "VOID" && meta.can.approve && (
                        <IconBtn title="Void" onClick={() => voidIt(r)} disabled={busy === r.id} tone="rose">
                          <Ban className="h-3.5 w-3.5" />
                        </IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {page} of {pages} · {data.total} entries
          </span>
          <div className="flex gap-2">
            <button className={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className={btnGhost} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {editing && (
        <EntryForm
          meta={meta}
          entry={editing === "new" ? null : editing}
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

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return (
    <div className={`${cardCls} p-4`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{note}</p>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  tone?: "emerald" | "rose";
}) {
  const t =
    tone === "emerald"
      ? "hover:border-emerald-500/50 hover:text-emerald-300"
      : tone === "rose"
        ? "hover:border-rose-500/50 hover:text-rose-300"
        : "hover:border-slate-600 hover:text-white";
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className={`rounded-lg border border-slate-700 p-1.5 text-slate-400 disabled:opacity-40 ${t}`}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * The form
 * ------------------------------------------------------------------ */

export function EntryForm({
  meta,
  entry,
  preset,
  onClose,
  onSaved,
}: {
  meta: Meta;
  entry: EntryRow | null;
  preset?: Partial<{ kind: string; categoryId: string; employeeId: string; payeeId: string }>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [kind, setKind] = useState(entry?.kind ?? preset?.kind ?? "EXPENSE");
  const cats = meta.categories.filter((c) => c.kind === kind && c.isActive);
  const [f, setF] = useState({
    categoryId: entry?.categoryId ?? preset?.categoryId ?? "",
    paidTo: entry?.employeeId ? "employee" : entry?.payeeId || preset?.payeeId ? "payee" : preset?.employeeId ? "employee" : "none",
    employeeId: entry?.employeeId ?? preset?.employeeId ?? "",
    payeeId: entry?.payeeId ?? preset?.payeeId ?? "",
    title: entry?.title ?? "",
    description: entry?.description ?? "",
    amount: entry ? String(entry.amount) : "",
    currency: entry?.currency ?? meta.defaultCurrency,
    taxAmount: entry && entry.taxAmount > 0 ? String(entry.taxAmount) : "",
    taxLabel: entry?.taxLabel ?? "",
    period: entry?.period ?? thisMonth(),
    dueDate: entry?.dueDate ? entry.dueDate.slice(0, 10) : "",
    paymentMethod: entry?.paymentMethod ?? "",
    reference: entry?.reference ?? "",
  });
  const [custom, setCustom] = useState<Record<string, string>>(entry?.customFields ?? {});
  const [attachments, setAttachments] = useState<string[]>(entry?.attachments ?? []);
  const [markPaid, setMarkPaid] = useState(false);
  const [saving, setSaving] = useState(false);

  // Keep the category valid when the type changes: a tax payment filed under
  // "Electricity" is refused by the server, so the form never offers it.
  useEffect(() => {
    if (!cats.some((c) => c.id === f.categoryId)) setF((x) => ({ ...x, categoryId: cats[0]?.id ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const defs = fieldsFor(meta, "ENTRY", f.categoryId);
  const rate = meta.currencies.find((c) => c.code === f.currency)?.usdRate ?? 0;
  const amt = Number(f.amount) || 0;
  const tax = Number(f.taxAmount) || 0;

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        kind,
        categoryId: f.categoryId,
        employeeId: f.paidTo === "employee" ? f.employeeId || null : null,
        payeeId: f.paidTo === "payee" ? f.payeeId || null : null,
        title: f.title,
        description: f.description || null,
        amount: amt,
        currency: f.currency,
        taxAmount: tax,
        taxLabel: tax > 0 ? f.taxLabel : null,
        period: f.period,
        dueDate: f.dueDate || null,
        paymentMethod: f.paymentMethod || null,
        reference: f.reference || null,
        attachments,
        customFields: custom,
        ...(entry ? {} : { markPaid }),
      };
      if (entry) {
        await api(`/api/admin/company-finance/entries/${entry.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Entry updated");
      } else {
        await api(`/api/admin/company-finance/entries`, { method: "POST", body: JSON.stringify(body) });
        toast.success(markPaid ? "Recorded and marked paid" : "Recorded — pending payment");
      }
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={entry ? "Edit entry" : "New entry"} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ENTRY_KIND_LABEL) as EntryKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                kind === k ? "border-emerald-500 bg-emerald-500/15 text-emerald-200" : "border-slate-700 text-slate-400 hover:text-white"
              }`}
            >
              {ENTRY_KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <select className={inputCls} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Month it is for" hint="A July bill paid in August belongs to July.">
            <input type="month" className={inputCls} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} />
          </Field>
          <Field label="Title" className="sm:col-span-2">
            <input className={inputCls} value={f.title} maxLength={160} placeholder="e.g. DESCO electricity bill" onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>

          <Field label="Paid to">
            <select className={inputCls} value={f.paidTo} onChange={(e) => setF({ ...f, paidTo: e.target.value })}>
              <option value="none">Nobody specific</option>
              <option value="payee">A company / person / platform</option>
              {meta.can.hrView && <option value="employee">An employee</option>}
            </select>
          </Field>
          {f.paidTo === "payee" && (
            <Field label="Payee" hint="Add new payees under the Payees tab.">
              <select className={inputCls} value={f.payeeId} onChange={(e) => setF({ ...f, payeeId: e.target.value })}>
                <option value="">Choose…</option>
                {meta.payees.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          )}
          {f.paidTo === "employee" && (
            <Field label="Employee">
              <select className={inputCls} value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
                <option value="">Choose…</option>
                {meta.employees.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.designation ? ` — ${p.designation}` : ""}</option>
                ))}
              </select>
            </Field>
          )}
          {f.paidTo === "none" && <div className="hidden sm:block" />}

          <Field label="Amount paid">
            <div className="flex gap-2">
              <input type="number" min={0} step="0.01" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
              <select className={`${inputCls} w-28`} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
                {meta.currencies.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </div>
            {f.currency !== "USD" && amt > 0 && rate > 0 && (
              <span className="mt-1 block text-[11px] text-slate-500">
                ≈ {usdFmt(amt / rate)} at {rate} {f.currency}/$ — the rate is frozen on the entry.
              </span>
            )}
          </Field>
          <Field label="Of which tax" hint="VAT or other tax INCLUDED in the amount. Kept out of costs.">
            <div className="flex gap-2">
              <input type="number" min={0} step="0.01" className={inputCls} value={f.taxAmount} placeholder="0" onChange={(e) => setF({ ...f, taxAmount: e.target.value })} />
              <input list="tax-labels" className={`${inputCls} w-36`} placeholder="VAT" value={f.taxLabel} onChange={(e) => setF({ ...f, taxLabel: e.target.value })} />
              <datalist id="tax-labels">
                {TAX_LABELS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </Field>

          <Field label="Due date">
            <input type="date" className={inputCls} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Field>
          <Field label="Payment method">
            <input list="pay-methods" className={inputCls} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })} />
            <datalist id="pay-methods">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Reference" hint="Cheque no., bank or bKash transaction ID, bill number.">
            <input className={inputCls} value={f.reference} maxLength={120} onChange={(e) => setF({ ...f, reference: e.target.value })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea className={inputCls} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
        </div>

        {defs.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">More details</p>
            <CustomFieldInputs defs={defs} values={custom} onChange={setCustom} />
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Receipts & bills</p>
          <ReceiptUpload value={attachments} onChange={setAttachments} />
          <p className="mt-1 text-[11px] text-slate-500">Stored privately — only finance can open them.</p>
        </div>

        {!entry && meta.can.approve && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
            Already paid — mark it paid now
          </label>
        )}
        {!entry && !meta.can.approve && (
          <p className="text-[11px] text-slate-500">This is recorded as pending. Someone with approval rights marks it paid.</p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={saving || !f.categoryId}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {entry ? "Save changes" : "Record entry"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
