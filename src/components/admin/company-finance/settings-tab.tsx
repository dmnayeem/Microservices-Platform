"use client";

import { useState } from "react";
import { Plus, Loader2, Pencil, Tags, ListPlus } from "lucide-react";
import { toast } from "@/lib/toast";
import { ENTRY_KIND_LABEL, FIELD_TYPES, type EntryKind } from "@/lib/company-finance/constants";
import { api, btnGhost, btnPrimary, cardCls, Field, inputCls, Modal, type Category, type Meta, type MetaField } from "./ui";

const TYPE_LABEL: Record<string, string> = {
  TEXT: "Short text",
  TEXTAREA: "Long text",
  NUMBER: "Number",
  DATE: "Date",
  SELECT: "Dropdown",
  URL: "Link",
};
const ENTITY_LABEL: Record<string, string> = { ENTRY: "Entries", EMPLOYEE: "Employees", PAYEE: "Payees" };

/**
 * The part of the books the owner shapes: categories, and the custom fields
 * that let "meter number" or "blood group" be added without a developer.
 * Nothing here is deleted — only switched off — because old entries still
 * point at it.
 */
export function SettingsTab({ meta, onChanged }: { meta: Meta; onChanged: () => void }) {
  const [cat, setCat] = useState<Category | "new" | null>(null);
  const [field, setField] = useState<MetaField | "new" | null>(null);

  const kinds = Object.keys(ENTRY_KIND_LABEL) as EntryKind[];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DefaultCurrency meta={meta} onChanged={onChanged} />

      <div className={`${cardCls} p-4`}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-white"><Tags className="h-4 w-4 text-slate-400" /> Categories</h3>
          <button className={btnPrimary} onClick={() => setCat("new")}><Plus className="h-4 w-4" /> Add</button>
        </div>
        {kinds.map((k) => {
          const list = meta.categories.filter((c) => c.kind === k);
          if (!list.length) return null;
          return (
            <div key={k} className="mb-4">
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">{ENTRY_KIND_LABEL[k]}</p>
              <div className="space-y-1">
                {list.map((c) => (
                  <div key={c.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-800/50 ${c.isActive ? "" : "opacity-50"}`}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color ?? "#64748b" }} />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{c.name}</span>
                    {c.isSystem && <span className="text-[10px] text-slate-600">built-in</span>}
                    {!c.isActive && <span className="text-[10px] text-slate-500">off</span>}
                    <button onClick={() => setCat(c)} className="rounded p-1 text-slate-500 hover:text-white" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className={`${cardCls} p-4`}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-white"><ListPlus className="h-4 w-4 text-slate-400" /> Custom fields</h3>
          <button className={btnPrimary} onClick={() => setField("new")}><Plus className="h-4 w-4" /> Add</button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Anything the forms do not already ask for — a meter number on Electricity, a blood group on Employees, a contract number on Payees.
        </p>
        {meta.fields.length === 0 ? (
          <p className="text-sm text-slate-500">None yet.</p>
        ) : (
          ["ENTRY", "EMPLOYEE", "PAYEE"].map((ent) => {
            const list = meta.fields.filter((f) => f.entity === ent);
            if (!list.length) return null;
            return (
              <div key={ent} className="mb-4">
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">{ENTITY_LABEL[ent]}</p>
                <div className="space-y-1">
                  {list.map((f) => (
                    <div key={f.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-800/50 ${f.isActive ? "" : "opacity-50"}`}>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                        {f.label}
                        {f.required && <span className="text-rose-400"> *</span>}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {TYPE_LABEL[f.type] ?? f.type}
                        {ent === "ENTRY" && ` · ${f.categoryName ?? "all categories"}`}
                      </span>
                      <button onClick={() => setField(f)} className="rounded p-1 text-slate-500 hover:text-white" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {cat && <CategoryForm cat={cat === "new" ? null : cat} onClose={() => setCat(null)} onSaved={() => { setCat(null); onChanged(); }} />}
      {field && <FieldForm meta={meta} field={field === "new" ? null : field} onClose={() => setField(null)} onSaved={() => { setField(null); onChanged(); }} />}
    </div>
  );
}

function CategoryForm({ cat, onClose, onSaved }: { cat: Category | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: cat?.name ?? "",
    kind: cat?.kind ?? "EXPENSE",
    color: cat?.color ?? "#64748b",
    isActive: cat?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api("/api/admin/company-finance/settings", {
        method: "POST",
        body: JSON.stringify({ category: { id: cat?.id, ...f } }),
      });
      toast.success(cat ? "Category saved" : "Category added");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={cat ? `Edit ${cat.name}` : "New category"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Type" hint={cat?.isSystem ? "A built-in category keeps its type." : undefined}>
          <select className={inputCls} value={f.kind} disabled={!!cat?.isSystem} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {Object.entries(ENTRY_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Colour"><input type="color" className="h-9 w-16 rounded border border-slate-700 bg-slate-950" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
        {cat && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
            Active — offered when recording entries
          </label>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>
        </div>
      </div>
    </Modal>
  );
}

function FieldForm({ meta, field, onClose, onSaved }: { meta: Meta; field: MetaField | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    entity: field?.entity ?? "ENTRY",
    categoryId: field?.categoryId ?? "",
    label: field?.label ?? "",
    type: field?.type ?? "TEXT",
    options: (field?.options ?? []).join("\n"),
    required: field?.required ?? false,
    isActive: field?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api("/api/admin/company-finance/settings", {
        method: "POST",
        body: JSON.stringify({
          field: {
            id: field?.id,
            entity: f.entity,
            categoryId: f.entity === "ENTRY" ? f.categoryId || null : null,
            label: f.label,
            type: f.type,
            options: f.options.split("\n").map((o) => o.trim()).filter(Boolean),
            required: f.required,
            isActive: f.isActive,
          },
        }),
      });
      toast.success(field ? "Field saved" : "Field added");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={field ? `Edit “${field.label}”` : "New custom field"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Adds to">
          <select className={inputCls} value={f.entity} disabled={!!field} onChange={(e) => setF({ ...f, entity: e.target.value })}>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
        {f.entity === "ENTRY" && (
          <Field label="Only for category" hint="Blank = shown on every entry.">
            <select className={inputCls} value={f.categoryId} disabled={!!field} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              <option value="">Every category</option>
              {meta.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Label"><input className={inputCls} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Meter number" /></Field>
        <Field label="Kind of answer">
          <select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </Field>
        {f.type === "SELECT" && (
          <Field label="Options" hint="One per line.">
            <textarea className={inputCls} rows={4} value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} />
          Required
        </label>
        {field && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
            Active
          </label>
        )}
        {field && <p className="text-[11px] text-slate-500">Where it applies cannot change once created — existing answers are stored against it.</p>}
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The currency a new entry, salary or recurring bill starts in. Every entry
 * still records its own currency and frozen rate; this only picks the default.
 */
function DefaultCurrency({ meta, onChanged }: { meta: Meta; onChanged: () => void }) {
  const [value, setValue] = useState(meta.defaultCurrency);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api("/api/admin/company-finance/settings", {
        method: "POST",
        body: JSON.stringify({ defaultCurrency: value }),
      });
      toast.success(`New entries now start in ${value}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={`${cardCls} p-4 lg:col-span-2`}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Default currency for new entries" hint="Each entry still keeps its own currency and the rate on the day it was recorded." className="min-w-[14rem] flex-1">
          <select className={inputCls} value={value} onChange={(e) => setValue(e.target.value)}>
            {meta.currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.code === "USD" ? "" : `(${c.usdRate} per $1)`}
              </option>
            ))}
          </select>
        </Field>
        <button className={btnPrimary} onClick={save} disabled={saving || value === meta.defaultCurrency}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}Save
        </button>
      </div>
    </div>
  );
}
