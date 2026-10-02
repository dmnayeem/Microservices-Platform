"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  RotateCw,
  Ban,
  Download,
  ArrowUp,
  ArrowDown,
  X,
  ExternalLink,
  CalendarClock,
  Search,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/company-finance/constants";
import {
  BILLING_CYCLES,
  BILLING_CYCLE_LABEL,
  CUSTOM_FIELD_TYPES,
  DEFAULT_REMIND_DAYS,
  SUB_CATEGORIES,
  SUB_STATUSES,
  advanceOneCycle,
  daysUntil,
  dueText,
  dueTone,
  isoDay,
  nextDueFrom,
  type BillingCycle,
  type CustomField,
  type CustomFieldType,
  type DueTone,
} from "@/lib/company-finance/subscriptions-shared";
import { api, btnGhost, btnPrimary, cardCls, Empty, Field, inputCls, Loading, Modal, money, usdFmt, type Meta } from "./ui";

type Sub = {
  id: string;
  name: string;
  category: string;
  vendor: string | null;
  accountRef: string | null;
  cost: number | null;
  currency: string;
  billingCycle: string;
  customCycleDays: number | null;
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  paymentMethod: string | null;
  ownerUserId: string | null;
  status: string;
  remindDaysBefore: number[];
  lastRemindedFor: string | null;
  notes: string | null;
  url: string | null;
  customFields: CustomField[] | null;
  payeeId: string | null;
  categoryId: string | null;
};
type Summary = { active: number; monthlyUsd: number; due7: number; due30: number; expired: number; unconverted: string[] };
type Loaded =
  | { ready: false; message: string }
  | { ready: true; rows: Sub[]; summary: Summary; owners: { id: string; name: string }[] };

const TONE: Record<DueTone, string> = {
  overdue: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  week: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  month: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  none: "bg-slate-800 text-slate-400 border-slate-700",
};

const date = (s: string | null) => (s ? new Date(s) : null);
const fmtDay = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

function DueChip({ s }: { s: Sub }) {
  if (s.status === "CANCELLED") return <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", TONE.none)}>Cancelled</span>;
  if (s.status === "EXPIRED") return <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", TONE.overdue)}>Expired</span>;
  const tone = dueTone(date(s.endDate), s.status);
  return <span className={cn("whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", TONE[tone])}>{dueText(date(s.endDate))}</span>;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Domains, hosting, SaaS — everything the company pays for on a cycle, and when
 * each one renews or runs out. The scheduler reminds the finance team and the
 * owner of each item; this screen is where they act on it.
 */
export function SubscriptionsTab({ meta }: { meta: Meta }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [sort, setSort] = useState<"due" | "name" | "cost">("due");
  const [editing, setEditing] = useState<Sub | "new" | null>(null);
  const [renewing, setRenewing] = useState<Sub | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Loaded>("/api/admin/company-finance/subscriptions"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load");
    }
  }, []);
  // First load straight from the promise (no synchronous setState in the
  // effect); `load` is for the reloads after a save.
  useEffect(() => {
    let alive = true;
    api<Loaded>("/api/admin/company-finance/subscriptions")
      .then((d) => alive && setData(d))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load"));
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (!data?.ready) return [];
    const needle = q.trim().toLowerCase();
    const list = data.rows.filter(
      (r) =>
        (!cat || r.category === cat) &&
        (!status || r.status === status) &&
        (!needle || [r.name, r.vendor, r.accountRef, r.notes, r.category].some((v) => v?.toLowerCase().includes(needle)))
    );
    return list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "cost") return (b.cost ?? 0) - (a.cost ?? 0);
      const ad = a.endDate ? new Date(a.endDate).getTime() : Infinity;
      const bd = b.endDate ? new Date(b.endDate).getTime() : Infinity;
      return ad - bd;
    });
  }, [data, q, cat, status, sort]);

  const upcoming = useMemo(() => {
    if (!data?.ready) return [];
    return data.rows
      .filter((r) => r.status === "ACTIVE" && r.endDate && daysUntil(new Date(r.endDate)) <= 90)
      .sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime());
  }, [data]);

  if (!data) return <Loading />;
  if (!data.ready) {
    return (
      <Empty>
        <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-400" />
        {data.message}
      </Empty>
    );
  }

  const categories = [...new Set([...SUB_CATEGORIES, ...data.rows.map((r) => r.category)])];
  const ownerName = (id: string | null) => data.owners.find((o) => o.id === id)?.name ?? null;

  const exportCsv = () => {
    const head = ["Name", "Category", "Vendor", "Account", "Cost", "Currency", "Cycle", "Start", "End / renewal", "Auto-renew", "Status", "Owner", "Payment method", "URL", "Notes", "Custom fields"];
    const lines = rows.map((r) =>
      [
        r.name,
        r.category,
        r.vendor,
        r.accountRef,
        r.cost,
        r.currency,
        r.billingCycle === "CUSTOM" ? `Every ${r.customCycleDays} days` : r.billingCycle,
        r.startDate.slice(0, 10),
        r.endDate?.slice(0, 10),
        r.autoRenew ? "yes" : "no",
        r.status,
        ownerName(r.ownerUserId),
        r.paymentMethod,
        r.url,
        r.notes,
        (r.customFields ?? []).map((f) => `${f.label}: ${f.value}`).join("; "),
      ]
        .map(csvCell)
        .join(",")
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `subscriptions-${isoDay(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cancel = async (s: Sub) => {
    if (!window.confirm(`Mark "${s.name}" as cancelled? Reminders stop for it.`)) return;
    try {
      await api(`/api/admin/company-finance/subscriptions/${s.id}`, { method: "POST", body: JSON.stringify({ action: "cancel" }) });
      toast.success(`${s.name} marked cancelled`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    }
  };

  const sm = data.summary;
  const cards = [
    { label: "Active", value: String(sm.active), tone: "text-white" },
    { label: "Monthly equivalent", value: usdFmt(sm.monthlyUsd), tone: "text-white", hint: sm.unconverted.length ? `Excludes ${sm.unconverted.join(", ")} (no rate)` : "In USD, all cycles" },
    { label: "Due in 7 days", value: String(sm.due7), tone: sm.due7 ? "text-orange-300" : "text-white" },
    { label: "Due in 30 days", value: String(sm.due30), tone: sm.due30 ? "text-amber-200" : "text-white" },
    { label: "Expired", value: String(sm.expired), tone: sm.expired ? "text-rose-300" : "text-white" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className={`${cardCls} p-3`}>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className={`mt-1 text-xl font-bold ${c.tone}`}>{c.value}</p>
            {c.hint && <p className="mt-0.5 text-[10px] text-slate-500">{c.hint}</p>}
          </div>
        ))}
      </div>

      <div className={`${cardCls} p-4`}>
        <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-white">
          <CalendarClock className="h-4 w-4 text-emerald-400" /> Upcoming — next 90 days
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing renews or expires in the next 90 days.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {upcoming.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="w-28 shrink-0 text-xs text-slate-400">{fmtDay(s.endDate)}</span>
                <span className="min-w-0 flex-1 truncate text-white">{s.name}</span>
                {s.cost != null && <span className="text-xs text-slate-300">{money(s.cost, s.currency, meta.currencies)}</span>}
                <span className="text-[10px] text-slate-500">{s.autoRenew ? "auto-renews" : "expires"}</span>
                <DueChip s={s} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`${cardCls} flex flex-wrap items-center gap-2 p-3`}>
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <input className={`${inputCls} pl-8`} placeholder="Search name, vendor, account…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={`${inputCls} w-auto`} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {SUB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <select className={`${inputCls} w-auto`} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="due">Sort: next due</option>
          <option value="name">Sort: name</option>
          <option value="cost">Sort: cost</option>
        </select>
        <button className={btnGhost} onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="h-4 w-4" /> CSV
        </button>
        {meta.can.create && (
          <button className={btnPrimary} onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add subscription
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty>
          {data.rows.length === 0
            ? "Nothing tracked yet. Add your domain and hosting first — those are the ones that take the site down when they lapse."
            : "Nothing matches these filters."}
        </Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <div key={s.id} className={cn(cardCls, "p-4", s.status === "CANCELLED" && "opacity-60")}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-white">{s.name}</p>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{s.category}</span>
                    <DueChip s={s} />
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white" aria-label="Open">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {[s.vendor, s.accountRef && `account ${s.accountRef}`, ownerName(s.ownerUserId) && `owner ${ownerName(s.ownerUserId)}`]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                  <p className="mt-1 text-sm text-white">
                    {s.cost != null ? money(s.cost, s.currency, meta.currencies) : "No cost set"}
                    <span className="ml-1 text-xs text-slate-500">
                      {s.billingCycle === "CUSTOM" ? `every ${s.customCycleDays} days` : BILLING_CYCLE_LABEL[s.billingCycle as BillingCycle]?.toLowerCase()}
                      {" · "}
                      {fmtDay(s.startDate)} → {fmtDay(s.endDate)}
                      {s.autoRenew ? " · auto-renews" : ""}
                    </span>
                  </p>
                  {(s.customFields ?? []).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(s.customFields ?? []).map((f, i) => (
                        <span key={i} className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                          {f.label}: {f.value || "—"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {meta.can.create && (
                  <div className="flex shrink-0 gap-1.5">
                    {s.status !== "CANCELLED" && s.billingCycle !== "ONE_TIME" && (
                      <button className={btnGhost} onClick={() => setRenewing(s)} title="Renewed">
                        <RotateCw className="h-4 w-4" /> Renewed
                      </button>
                    )}
                    <button className={btnGhost} onClick={() => setEditing(s)} title="Edit" aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    {s.status !== "CANCELLED" && (
                      <button className={btnGhost} onClick={() => void cancel(s)} title="Cancel" aria-label="Cancel">
                        <Ban className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <SubscriptionForm
          meta={meta}
          owners={data.owners}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {renewing && (
        <RenewDialog
          meta={meta}
          sub={renewing}
          onClose={() => setRenewing(null)}
          onDone={() => {
            setRenewing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Create / edit
 * ------------------------------------------------------------------ */

function SubscriptionForm({
  meta,
  owners,
  initial,
  onClose,
  onSaved,
}: {
  meta: Meta;
  owners: { id: string; name: string }[];
  initial: Sub | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(() => ({
    name: initial?.name ?? "",
    category: initial?.category ?? "Domain",
    vendor: initial?.vendor ?? "",
    accountRef: initial?.accountRef ?? "",
    cost: initial?.cost == null ? "" : String(initial.cost),
    currency: initial?.currency ?? "USD",
    billingCycle: initial?.billingCycle ?? "YEARLY",
    customCycleDays: initial?.customCycleDays ? String(initial.customCycleDays) : "",
    startDate: initial?.startDate.slice(0, 10) ?? isoDay(new Date()),
    endDate: initial?.endDate?.slice(0, 10) ?? "",
    autoRenew: initial?.autoRenew ?? false,
    paymentMethod: initial?.paymentMethod ?? "",
    ownerUserId: initial?.ownerUserId ?? "",
    status: initial?.status ?? "ACTIVE",
    remind: (initial?.remindDaysBefore ?? DEFAULT_REMIND_DAYS).join(", "),
    notes: initial?.notes ?? "",
    url: initial?.url ?? "",
    payeeId: initial?.payeeId ?? "",
    categoryId: initial?.categoryId ?? "",
  }));
  const [fields, setFields] = useState<CustomField[]>(initial?.customFields ?? []);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const suggestEnd = () => {
    const d = nextDueFrom(new Date(`${f.startDate}T00:00:00Z`), f.billingCycle, Number(f.customCycleDays) || null);
    if (d) set("endDate", isoDay(d));
    else toast.error("A one-time purchase has no renewal date");
  };

  const moveField = (i: number, by: number) =>
    setFields((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...f,
        remindDaysBefore: f.remind.split(/[,\s]+/).filter(Boolean).map(Number),
        customFields: fields,
        endDate: f.endDate || null,
      };
      await api(initial ? `/api/admin/company-finance/subscriptions/${initial.id}` : "/api/admin/company-finance/subscriptions", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      toast.success(initial ? "Saved" : "Subscription added");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const expenseCats = meta.categories.filter((c) => c.kind === "EXPENSE" && c.isActive);

  return (
    <Modal title={initial ? `Edit ${initial.name}` : "Add subscription"} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *">
          <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Hostinger hosting" />
        </Field>
        <Field label="Category *" hint="Pick one or type your own">
          <input className={inputCls} list="sub-cats" value={f.category} onChange={(e) => set("category", e.target.value)} />
          <datalist id="sub-cats">
            {SUB_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Vendor">
          <input className={inputCls} value={f.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="Hostinger, Namecheap, Google…" />
        </Field>
        <Field label="Account / login id" hint="Don't store passwords here — keep them in a password manager.">
          <input className={inputCls} value={f.accountRef} onChange={(e) => set("accountRef", e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Cost per cycle">
          <div className="flex gap-2">
            <input className={inputCls} type="number" min="0" step="0.01" value={f.cost} onChange={(e) => set("cost", e.target.value)} />
            <select className={`${inputCls} w-28`} value={f.currency} onChange={(e) => set("currency", e.target.value)}>
              {meta.currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="Billing cycle *">
          <div className="flex gap-2">
            <select className={inputCls} value={f.billingCycle} onChange={(e) => set("billingCycle", e.target.value)}>
              {BILLING_CYCLES.map((c) => (
                <option key={c} value={c}>
                  {BILLING_CYCLE_LABEL[c]}
                </option>
              ))}
            </select>
            {f.billingCycle === "CUSTOM" && (
              <input className={`${inputCls} w-28`} type="number" min="1" placeholder="days" value={f.customCycleDays} onChange={(e) => set("customCycleDays", e.target.value)} />
            )}
          </div>
        </Field>
        <Field label="Start date *">
          <input className={inputCls} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="End / next renewal date">
          <div className="flex gap-2">
            <input className={inputCls} type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
            <button type="button" className={btnGhost} onClick={suggestEnd} title="Next due date from the start date and cycle">
              Suggest
            </button>
          </div>
        </Field>
        <Field label="Remind days before" hint="Comma-separated, e.g. 30, 7, 1">
          <input className={inputCls} value={f.remind} onChange={(e) => set("remind", e.target.value)} />
        </Field>
        <Field label="Responsible person">
          <select className={inputCls} value={f.ownerUserId} onChange={(e) => set("ownerUserId", e.target.value)}>
            <option value="">— Finance team only —</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payment method">
          <input className={inputCls} list="sub-pay" value={f.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} />
          <datalist id="sub-pay">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="Status">
          <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
            {SUB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payee (optional)">
          <select className={inputCls} value={f.payeeId} onChange={(e) => set("payeeId", e.target.value)}>
            <option value="">—</option>
            {meta.payees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expense category (optional)" hint="Used when a renewal is recorded as an expense">
          <select className={inputCls} value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">—</option>
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Link (dashboard / billing page)" className="sm:col-span-2">
          <input className={inputCls} type="url" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2">
          <input type="checkbox" checked={f.autoRenew} onChange={(e) => set("autoRenew", e.target.checked)} />
          Renews automatically (card on file). Without this, it is marked expired once the date passes.
        </label>
        <Field label="Notes" className="sm:col-span-2">
          <textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Custom fields</p>
          <button type="button" className={btnGhost} onClick={() => setFields((l) => [...l, { label: "", type: "text", value: "" }])}>
            <Plus className="h-4 w-4" /> Add field
          </button>
        </div>
        {fields.length === 0 && <p className="text-xs text-slate-500">e.g. Registrar, DNS provider, seats, licence key id, plan name.</p>}
        <div className="space-y-2">
          {fields.map((cf, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                className={`${inputCls} w-40`}
                placeholder="Label"
                value={cf.label}
                onChange={(e) => setFields((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <select
                className={`${inputCls} w-28`}
                value={cf.type}
                onChange={(e) => setFields((l) => l.map((x, j) => (j === i ? { ...x, type: e.target.value as CustomFieldType } : x)))}
              >
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                className={`${inputCls} min-w-[8rem] flex-1`}
                type={cf.type === "number" || cf.type === "money" ? "number" : cf.type === "date" ? "date" : cf.type === "url" ? "url" : "text"}
                step={cf.type === "money" ? "0.01" : undefined}
                placeholder="Value"
                value={cf.value}
                onChange={(e) => setFields((l) => l.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              />
              <button type="button" className="p-1 text-slate-500 hover:text-white" onClick={() => moveField(i, -1)} aria-label="Move up">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" className="p-1 text-slate-500 hover:text-white" onClick={() => moveField(i, 1)} aria-label="Move down">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" className="p-1 text-slate-500 hover:text-rose-400" onClick={() => setFields((l) => l.filter((_, j) => j !== i))} aria-label="Remove">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>
          Close
        </button>
        <button className={btnPrimary} onClick={() => void save()} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Renewed
 * ------------------------------------------------------------------ */

function RenewDialog({ meta, sub, onClose, onDone }: { meta: Meta; sub: Sub; onClose: () => void; onDone: () => void }) {
  const from = sub.endDate ? new Date(sub.endDate) : new Date();
  const next = advanceOneCycle(from, sub.billingCycle, sub.customCycleDays);
  const expenseCats = meta.categories.filter((c) => c.kind === "EXPENSE" && c.isActive);
  const fallbackCat =
    sub.categoryId ??
    expenseCats.find((c) => c.slug === (/(host|domain|cloud)/i.test(sub.category) ? "server" : "software"))?.id ??
    expenseCats[0]?.id ??
    "";
  const [createExpense, setCreateExpense] = useState(sub.cost != null && sub.cost > 0);
  const [amount, setAmount] = useState(sub.cost == null ? "" : String(sub.cost));
  const [currency, setCurrency] = useState(sub.currency);
  const [categoryId, setCategoryId] = useState(fallbackCat);
  const [markPaid, setMarkPaid] = useState(false);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const r = await api<{ endDate: string; entryId: string | null }>(`/api/admin/company-finance/subscriptions/${sub.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "renew", createExpense, amount: Number(amount), currency, categoryId, markPaid }),
      });
      toast.success(`${sub.name} renewed to ${fmtDay(r.endDate)}${r.entryId ? " — expense recorded" : ""}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not renew");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Renewed: ${sub.name}`} onClose={onClose}>
      <p className="text-sm text-slate-300">
        Moves the renewal date from <b>{fmtDay(sub.endDate)}</b> to <b>{next ? fmtDay(next.toISOString()) : "—"}</b>.
      </p>
      <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={createExpense} onChange={(e) => setCreateExpense(e.target.checked)} />
        Also record the cost as an expense in the books
      </label>
      {createExpense && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Amount">
            <div className="flex gap-2">
              <input className={inputCls} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <select className={`${inputCls} w-28`} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {meta.currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Category">
            <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          {meta.can.approve && (
            <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2">
              <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
              Already paid — record it as paid
            </label>
          )}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>
          Close
        </button>
        <button className={btnPrimary} onClick={() => void go()} disabled={busy || !next}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirm renewal
        </button>
      </div>
    </Modal>
  );
}
