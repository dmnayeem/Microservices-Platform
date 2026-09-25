"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Loader2, History, UserCircle2 } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYMENT_TYPES,
  PAYMENT_METHODS,
  SALARY_CYCLES,
  periodLabel,
} from "@/lib/company-finance/constants";
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
  money,
  Pill,
  type Meta,
} from "./ui";

type Employee = {
  id: string;
  userId: string | null;
  user: { id: string; name: string | null; email: string; role: string } | null;
  name: string;
  designation: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  nationalId: string | null;
  photoUrl: string | null;
  employmentType: string;
  status: string;
  joinDate: string | null;
  leaveDate: string | null;
  salaryAmount: number;
  salaryCurrency: string;
  salaryCycle: string;
  commissionNote: string | null;
  commissionPct: number | null;
  paymentMethod: string | null;
  paymentDetails: string | null;
  emergencyContact: string | null;
  notes: string | null;
  customFields: Record<string, string> | null;
};

export function EmployeesTab({ meta, onChanged }: { meta: Meta; onChanged?: () => void }) {
  const [rows, setRows] = useState<Employee[] | null>(null);
  const [status, setStatus] = useState("ACTIVE");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [history, setHistory] = useState<Employee | null>(null);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (q.trim()) p.set("q", q.trim());
      const r = await api<{ employees: Employee[] }>(`/api/admin/company-finance/employees?${p}`);
      setRows(r.employees);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load employees");
    }
  }, [status, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  // Monthly wage bill of the people on screen, per currency — a mix of taka
  // and dollar salaries must not be added into one meaningless number.
  const bill = (rows ?? [])
    .filter((e) => e.status !== "LEFT" && e.salaryCycle === "MONTHLY")
    .reduce<Record<string, number>>((acc, e) => {
      acc[e.salaryCurrency] = (acc[e.salaryCurrency] ?? 0) + e.salaryAmount;
      return acc;
    }, {});

  return (
    <div className="space-y-4">
      <div className={`${cardCls} flex flex-wrap items-center gap-2 p-3`}>
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input className={`${inputCls} pl-9`} placeholder="Search name, role, department" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={`${inputCls} w-40`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Everyone</option>
          {EMPLOYEE_STATUSES.map((s) => (
            <option key={s} value={s}>{EMPLOYEE_STATUS_LABEL[s]}</option>
          ))}
        </select>
        {meta.can.hrManage && (
          <button className={btnPrimary} onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add employee
          </button>
        )}
      </div>

      {Object.keys(bill).length > 0 && (
        <p className="text-xs text-slate-400">
          Monthly wage bill for the people shown:{" "}
          {Object.entries(bill).map(([c, v], i) => (
            <span key={c} className="font-semibold text-white">
              {i > 0 && " + "}
              {money(v, c, meta.currencies)}
            </span>
          ))}
        </p>
      )}

      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No employees here yet. Add office staff, including those without a platform account — a cleaner or a peon.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((e) => (
            <div key={e.id} className={`${cardCls} p-4`}>
              <div className="flex items-start gap-3">
                {e.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <UserCircle2 className="h-10 w-10 text-slate-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{e.name}</p>
                  <p className="truncate text-xs text-slate-400">
                    {[e.designation, e.department].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Pill value={e.status} label={EMPLOYEE_STATUS_LABEL[e.status as keyof typeof EMPLOYEE_STATUS_LABEL]} />
                    <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {EMPLOYMENT_TYPE_LABEL[e.employmentType as keyof typeof EMPLOYMENT_TYPE_LABEL]}
                    </span>
                    {e.user && (
                      <span className="rounded border border-emerald-600/40 px-1.5 py-0.5 text-[10px] text-emerald-300" title={e.user.email}>
                        has account
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2 border-t border-slate-800 pt-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Pay</p>
                  <p className="font-semibold text-white">
                    {e.salaryAmount > 0 ? money(e.salaryAmount, e.salaryCurrency, meta.currencies) : "Not set"}
                    <span className="ml-1 text-xs font-normal text-slate-500">/ {e.salaryCycle.toLowerCase().replace("ly", "")}</span>
                  </p>
                  {e.commissionPct !== null && <p className="text-[11px] text-slate-400">+ {e.commissionPct}% commission</p>}
                </div>
                <div className="flex gap-1">
                  <button className={btnGhost} onClick={() => setHistory(e)} title="Pay history">
                    <History className="h-4 w-4" />
                  </button>
                  {meta.can.hrManage && (
                    <button className={btnGhost} onClick={() => setEditing(e)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EmployeeForm
          meta={meta}
          employee={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            onChanged?.();
          }}
        />
      )}
      {history && <PayHistory meta={meta} employee={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function PayHistory({ meta, employee, onClose }: { meta: Meta; employee: Employee; onClose: () => void }) {
  const [rows, setRows] = useState<
    { id: string; title: string; period: string; status: string; amount: number; currency: string; paidAt: string | null }[] | null
  >(null);
  useEffect(() => {
    api<{ history: NonNullable<typeof rows> }>(`/api/admin/company-finance/employees/${employee.id}`)
      .then((r) => setRows(r.history))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load"));
  }, [employee.id]);
  return (
    <Modal title={`${employee.name} — pay history`} onClose={onClose}>
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>Nothing paid to {employee.name} has been recorded yet.</Empty>
      ) : (
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-white">{r.title}</p>
                <p className="text-[11px] text-slate-500">
                  {periodLabel(r.period)}
                  {r.paidAt && ` · paid ${new Date(r.paidAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-white">{money(r.amount, r.currency, meta.currencies)}</p>
                <Pill value={r.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function EmployeeForm({
  meta,
  employee,
  onClose,
  onSaved,
}: {
  meta: Meta;
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const d = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");
  const [f, setF] = useState({
    name: employee?.name ?? "",
    designation: employee?.designation ?? "",
    department: employee?.department ?? "",
    phone: employee?.phone ?? "",
    email: employee?.email ?? "",
    address: employee?.address ?? "",
    nationalId: employee?.nationalId ?? "",
    photoUrl: employee?.photoUrl ?? "",
    employmentType: employee?.employmentType ?? "FULL_TIME",
    status: employee?.status ?? "ACTIVE",
    joinDate: d(employee?.joinDate),
    leaveDate: d(employee?.leaveDate),
    salaryAmount: employee ? String(employee.salaryAmount) : "",
    salaryCurrency: employee?.salaryCurrency ?? meta.defaultCurrency,
    salaryCycle: employee?.salaryCycle ?? "MONTHLY",
    commissionPct: employee?.commissionPct === null || employee?.commissionPct === undefined ? "" : String(employee.commissionPct),
    commissionNote: employee?.commissionNote ?? "",
    paymentMethod: employee?.paymentMethod ?? "",
    paymentDetails: employee?.paymentDetails ?? "",
    emergencyContact: employee?.emergencyContact ?? "",
    notes: employee?.notes ?? "",
  });
  const [custom, setCustom] = useState<Record<string, string>>(employee?.customFields ?? {});
  const [saving, setSaving] = useState(false);
  const defs = fieldsFor(meta, "EMPLOYEE");
  const s = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        ...f,
        userId: employee?.userId ?? null,
        salaryAmount: Number(f.salaryAmount) || 0,
        commissionPct: f.commissionPct === "" ? null : Number(f.commissionPct),
        joinDate: f.joinDate || null,
        leaveDate: f.leaveDate || null,
        customFields: custom,
      };
      if (employee) {
        await api(`/api/admin/company-finance/employees/${employee.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Employee updated");
      } else {
        await api(`/api/admin/company-finance/employees`, { method: "POST", body: JSON.stringify(body) });
        toast.success("Employee added");
      }
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={employee ? `Edit ${employee.name}` : "Add employee"} onClose={onClose} wide>
      <div className="space-y-5">
        <Section title="Person">
          <Field label="Full name *"><input className={inputCls} value={f.name} onChange={s("name")} /></Field>
          <Field label="Designation" hint="Cleaner, Office assistant, Developer…"><input className={inputCls} value={f.designation} onChange={s("designation")} /></Field>
          <Field label="Department"><input className={inputCls} value={f.department} onChange={s("department")} /></Field>
          <Field label="Phone"><input className={inputCls} value={f.phone} onChange={s("phone")} /></Field>
          <Field label="Email"><input className={inputCls} type="email" value={f.email} onChange={s("email")} /></Field>
          <Field label="National ID"><input className={inputCls} value={f.nationalId} onChange={s("nationalId")} /></Field>
          <Field label="Address" className="sm:col-span-2"><input className={inputCls} value={f.address} onChange={s("address")} /></Field>
          <Field label="Emergency contact" className="sm:col-span-2"><input className={inputCls} value={f.emergencyContact} onChange={s("emergencyContact")} /></Field>
        </Section>

        <Section title="Employment">
          <Field label="Type">
            <select className={inputCls} value={f.employmentType} onChange={s("employmentType")}>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>{EMPLOYMENT_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={f.status} onChange={s("status")}>
              {EMPLOYEE_STATUSES.map((t) => (
                <option key={t} value={t}>{EMPLOYEE_STATUS_LABEL[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Joined"><input className={inputCls} type="date" value={f.joinDate} onChange={s("joinDate")} /></Field>
          <Field label="Left" hint={f.status === "LEFT" ? "Required when status is Left." : undefined}>
            <input className={inputCls} type="date" value={f.leaveDate} onChange={s("leaveDate")} />
          </Field>
        </Section>

        <Section title="Pay">
          <Field label="Salary per cycle">
            <div className="flex gap-2">
              <input className={inputCls} type="number" min={0} step="0.01" value={f.salaryAmount} onChange={s("salaryAmount")} />
              <select className={`${inputCls} w-28`} value={f.salaryCurrency} onChange={s("salaryCurrency")}>
                {meta.currencies.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Cycle">
            <select className={inputCls} value={f.salaryCycle} onChange={s("salaryCycle")}>
              {SALARY_CYCLES.map((c) => (
                <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </Field>
          <Field label="Commission %" hint="Optional. Commission payments are recorded as entries.">
            <input className={inputCls} type="number" min={0} max={100} step="0.01" value={f.commissionPct} onChange={s("commissionPct")} />
          </Field>
          <Field label="Commission terms"><input className={inputCls} value={f.commissionNote} onChange={s("commissionNote")} placeholder="e.g. 2% of ad sales they close" /></Field>
          <Field label="Paid by">
            <input list="emp-pay-methods" className={inputCls} value={f.paymentMethod} onChange={s("paymentMethod")} />
            <datalist id="emp-pay-methods">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Account / bKash number"><input className={inputCls} value={f.paymentDetails} onChange={s("paymentDetails")} /></Field>
        </Section>

        {defs.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">More details</p>
            <CustomFieldInputs defs={defs} values={custom} onChange={setCustom} />
          </div>
        )}

        <Field label="Notes"><textarea className={inputCls} rows={2} value={f.notes} onChange={s("notes")} /></Field>

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {employee ? "Save changes" : "Add employee"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}
