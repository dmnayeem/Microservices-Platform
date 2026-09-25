"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCheck, ClipboardList } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { periodLabel } from "@/lib/company-finance/constants";
import { api, btnGhost, btnPrimary, cardCls, Empty, Loading, money, Pill, thisMonth, type Meta } from "./ui";

type Row = {
  id: string;
  name: string;
  designation: string | null;
  status: string;
  salaryAmount: number;
  salaryCurrency: string;
  paymentMethod: string | null;
  entry: { id: string; status: string; amount: number; currency: string; paidAt: string | null } | null;
};

/**
 * One month of payroll for everyone on the books — account or not.
 *
 * "Record" writes each salary as PENDING (owed). "Pay" also marks it paid and
 * needs the approve permission, so preparing payroll and releasing it can be
 * two different people. Both are safe to press twice: a salary for one person
 * and one month can exist once, and the second press says so.
 */
export function SalaryTab({ meta, onChanged }: { meta: Meta; onChanged?: () => void }) {
  const [period, setPeriod] = useState(thisMonth());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      const r = await api<{ rows: Row[] }>(`/api/admin/company-finance/salary?period=${period}`);
      setRows(r.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the sheet");
      setRows([]);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const todo = (rows ?? []).filter((r) => !r.entry && r.salaryAmount > 0 && r.status !== "LEFT");
  const noSalary = (rows ?? []).filter((r) => !r.entry && r.salaryAmount <= 0);

  const runAll = async (markPaid: boolean) => {
    const ok = await confirmDialog({
      title: `${markPaid ? "Pay" : "Record"} ${periodLabel(period)} salaries for ${todo.length} employee${todo.length === 1 ? "" : "s"}?`,
      description: markPaid
        ? "Each salary is recorded AND marked paid, at the amount on the employee's record. Only do this once the money has actually gone out."
        : "Each salary is recorded as owed (pending). You mark them paid as you hand the money over.",
      confirmLabel: markPaid ? "Pay all" : "Record all",
    });
    if (!ok) return;
    setBusy("all");
    try {
      const r = await api<{ recorded: number; errors: string[] }>(`/api/admin/company-finance/salary`, {
        method: "POST",
        body: JSON.stringify({ period, all: true, markPaid }),
      });
      toast.success(`${r.recorded} salar${r.recorded === 1 ? "y" : "ies"} ${markPaid ? "paid" : "recorded"}`);
      if (r.errors.length) toast.error(r.errors.slice(0, 3).join(" · "));
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not run payroll");
    } finally {
      setBusy(null);
    }
  };

  const one = async (row: Row, markPaid: boolean) => {
    setBusy(row.id);
    try {
      await api(`/api/admin/company-finance/salary`, {
        method: "POST",
        body: JSON.stringify({ period, employeeId: row.id, markPaid }),
      });
      toast.success(`${row.name}: ${markPaid ? "paid" : "recorded"}`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record it");
    } finally {
      setBusy(null);
    }
  };

  const payExisting = async (row: Row) => {
    if (!row.entry) return;
    setBusy(row.id);
    try {
      await api(`/api/admin/company-finance/entries/${row.entry.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "pay" }),
      });
      toast.success(`${row.name}: paid`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark it paid");
    } finally {
      setBusy(null);
    }
  };

  const totals = (rows ?? []).reduce<Record<string, { owed: number; paid: number }>>((acc, r) => {
    const cur = r.entry?.currency ?? r.salaryCurrency;
    acc[cur] ??= { owed: 0, paid: 0 };
    if (r.entry?.status === "PAID") acc[cur].paid += r.entry.amount;
    else acc[cur].owed += r.entry?.amount ?? r.salaryAmount;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className={`${cardCls} flex flex-wrap items-center gap-2 p-3`}>
        <input type="month" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <span className="text-sm text-slate-400">{periodLabel(period)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className={btnGhost} disabled={!todo.length || busy !== null || !meta.can.hrManage} onClick={() => runAll(false)}>
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            Record all as owed ({todo.length})
          </button>
          {meta.can.approve && (
            <button className={btnPrimary} disabled={!todo.length || busy !== null || !meta.can.hrManage} onClick={() => runAll(true)}>
              <CheckCheck className="h-4 w-4" /> Pay all ({todo.length})
            </button>
          )}
        </div>
      </div>

      {Object.keys(totals).length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-slate-400">
          {Object.entries(totals).map(([c, t]) => (
            <span key={c}>
              {c}: <span className="font-semibold text-emerald-300">{money(t.paid, c, meta.currencies)} paid</span>
              {" · "}
              <span className="font-semibold text-amber-300">{money(t.owed, c, meta.currencies)} still owed</span>
            </span>
          ))}
        </div>
      )}

      {noSalary.length > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          No salary set for: {noSalary.map((r) => r.name).join(", ")}. Set it on their employee record, or record their pay as a normal entry.
        </p>
      )}

      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>Nobody was employed in {periodLabel(period)}. Add employees on the Employees tab.</Empty>
      ) : (
        <div className={`${cardCls} overflow-x-auto`}>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2 text-right">Salary</th>
                <th className="px-3 py-2">This month</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-white">{r.name}</p>
                    <p className="text-[11px] text-slate-500">{r.designation ?? "—"}{r.paymentMethod && ` · ${r.paymentMethod}`}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right text-white">
                    {r.salaryAmount > 0 ? money(r.salaryAmount, r.salaryCurrency, meta.currencies) : <span className="text-slate-600">not set</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.entry ? (
                      <div className="flex items-center gap-2">
                        <Pill value={r.entry.status} />
                        <span className="text-xs text-slate-400">{money(r.entry.amount, r.entry.currency, meta.currencies)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Nothing recorded</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      {!r.entry && r.salaryAmount > 0 && meta.can.hrManage && (
                        <>
                          <button className={btnGhost} disabled={busy !== null} onClick={() => one(r, false)}>
                            {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record"}
                          </button>
                          {meta.can.approve && (
                            <button className={btnPrimary} disabled={busy !== null} onClick={() => one(r, true)}>Pay</button>
                          )}
                        </>
                      )}
                      {r.entry?.status === "PENDING" && meta.can.approve && (
                        <button className={btnPrimary} disabled={busy !== null} onClick={() => payExisting(r)}>
                          {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark paid"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        Staff paid into their platform wallet are handled by Wallet Payroll. This sheet is for pay handed over outside the platform — cash, bKash, bank.
      </p>
    </div>
  );
}
