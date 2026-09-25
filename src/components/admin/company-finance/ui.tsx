"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, X, Upload, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { FieldDef } from "@/lib/company-finance/constants";

/**
 * Small pieces every company-finance tab shares, so the nine screens look and
 * behave as one product: one fetch helper that turns a refusal into a toast,
 * one modal, one way to render custom fields, one receipt uploader.
 */

export const inputCls =
  "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50";
export const labelCls = "block text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1";
export const cardCls = "rounded-xl border border-slate-800 bg-slate-900/70";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-50";

/** Fetch JSON; a non-2xx becomes an Error carrying the server's sentence. */
export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

/* ------------------------------------------------------------------ *
 * Shared boot data
 * ------------------------------------------------------------------ */

export type Category = {
  id: string;
  kind: string;
  name: string;
  slug: string | null;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  isSystem: boolean;
};
export type Currency = { code: string; symbol: string; usdRate: number };
export type MetaField = {
  id: string;
  entity: string;
  categoryId: string | null;
  categoryName: string | null;
  key: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  isActive: boolean;
};
export type Meta = {
  categories: Category[];
  currencies: Currency[];
  defaultCurrency: string;
  fields: MetaField[];
  payees: { id: string; name: string; kind: string }[];
  employees: { id: string; name: string; designation: string | null }[];
  can: { create: boolean; approve: boolean; hrView: boolean; hrManage: boolean; settings: boolean; staff: boolean };
  role: string;
};

export function useFinanceMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setMeta(await api<Meta>("/api/admin/company-finance/meta"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, []);
  // First load straight from the promise, so no state is set synchronously
  // inside the effect; `load` stays for the explicit reloads after a save.
  useEffect(() => {
    let alive = true;
    api<Meta>("/api/admin/company-finance/meta")
      .then((m) => alive && setMeta(m))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load"));
    return () => {
      alive = false;
    };
  }, []);
  return { meta, error, reload: load };
}

/** Active custom fields for a target — for ENTRY, the shared ones plus the category's. */
export function fieldsFor(meta: Meta, entity: string, categoryId?: string | null): FieldDef[] {
  return meta.fields
    .filter(
      (f) =>
        f.isActive &&
        f.entity === entity &&
        (entity !== "ENTRY" || f.categoryId === null || f.categoryId === categoryId)
    )
    .map((f) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      type: f.type as FieldDef["type"],
      options: f.options,
      required: f.required,
    }));
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

export function money(amount: number, currency: string, currencies?: Currency[]): string {
  const sym = currency === "USD" ? "$" : currencies?.find((c) => c.code === currency)?.symbol ?? `${currency} `;
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n < 0 ? "-" : ""}${sym}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function usdFmt(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function thisMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Bits of UI
 * ------------------------------------------------------------------ */

const STATUS_TONE: Record<string, string> = {
  PAID: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PENDING: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  VOID: "bg-slate-500/15 text-slate-400 border-slate-500/30 line-through",
  ACTIVE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  ON_LEAVE: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  LEFT: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  SUSPENDED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function Pill({ value, label }: { value: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        STATUS_TONE[value] ?? "bg-slate-800 text-slate-300 border-slate-700"
      )}
    >
      {label ?? value.replace("_", " ")}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  // Escape closes, as every other dialog in the admin does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div className={cn(cardCls, "w-full bg-slate-900 p-5 shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">{children}</p>;
}

export function Loading() {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

/** The custom fields an admin defined, rendered as inputs. */
export function CustomFieldInputs({
  defs,
  values,
  onChange,
}: {
  defs: FieldDef[];
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  if (defs.length === 0) return null;
  const set = (k: string, v: string) => onChange({ ...values, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {defs.map((d) => (
        <Field key={d.id} label={`${d.label}${d.required ? " *" : ""}`} className={d.type === "TEXTAREA" ? "sm:col-span-2" : ""}>
          {d.type === "SELECT" ? (
            <select className={inputCls} value={values[d.key] ?? ""} onChange={(e) => set(d.key, e.target.value)}>
              <option value="">—</option>
              {d.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : d.type === "TEXTAREA" ? (
            <textarea className={inputCls} rows={3} value={values[d.key] ?? ""} onChange={(e) => set(d.key, e.target.value)} />
          ) : (
            <input
              className={inputCls}
              type={d.type === "NUMBER" ? "number" : d.type === "DATE" ? "date" : d.type === "URL" ? "url" : "text"}
              value={values[d.key] ?? ""}
              onChange={(e) => set(d.key, e.target.value)}
            />
          )}
        </Field>
      ))}
    </div>
  );
}

/** Link to a stored attachment: a private receipt key, or an external https link. */
export function attachmentHref(a: string): string {
  return a.startsWith("finance-receipts/") ? `/api/admin/company-finance/receipts?key=${encodeURIComponent(a)}` : a;
}

export function attachmentName(a: string): string {
  const last = a.split("/").pop() ?? a;
  // Keys are `<ts>_<rand>_<name>` — show the name the person uploaded.
  return decodeURIComponent(last.replace(/^\d+_[a-z0-9]+_/i, ""));
}

/**
 * Receipts go to the PRIVATE finance store, never the shared media library —
 * see /api/admin/company-finance/receipts for why.
 */
export function ReceiptUpload({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const added: string[] = [];
    try {
      for (const f of Array.from(files).slice(0, 10 - value.length)) {
        const fd = new FormData();
        fd.set("file", f);
        const r = await api<{ key: string }>("/api/admin/company-finance/receipts", { method: "POST", body: fd });
        added.push(r.key);
      }
      onChange([...value, ...added]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      if (added.length) onChange([...value, ...added]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {value.map((a) => (
        <div key={a} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <a href={attachmentHref(a)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-slate-300 hover:text-white">
            {attachmentName(a)}
          </a>
          <button type="button" onClick={() => onChange(value.filter((x) => x !== a))} className="text-slate-500 hover:text-rose-400" aria-label="Remove">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {value.length < 10 && (
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className={btnGhost}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Attach receipt
        </button>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept="application/pdf,image/*,.csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
    </div>
  );
}

export function AttachmentLinks({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((a) => (
        <a
          key={a}
          href={attachmentHref(a)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-[12rem] items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{attachmentName(a)}</span>
        </a>
      ))}
    </div>
  );
}
