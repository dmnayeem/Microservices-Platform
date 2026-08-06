"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Pencil, GripVertical } from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  order: number;
  isActive: boolean;
  offerCount: number;
}

const inp =
  "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500";

const EMPTY = { name: "", description: "", icon: "", color: "#10b981", order: 0, isActive: true };

export function OfferwallCategoriesManager({
  initial,
  canManage,
}: {
  initial: Category[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const startCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };
  const startEdit = (c: Category) => {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? "",
      icon: c.icon ?? "",
      color: c.color ?? "#10b981",
      order: c.order,
      isActive: c.isActive,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      const url = editing
        ? `/api/admin/offerwall/categories/${editing.id}`
        : "/api/admin/offerwall/categories";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      toast.success(editing ? "Category updated" : "Category created");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error("Failed", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Category) => {
    if (!confirm(`Delete "${c.name}" and its ${c.offerCount} offer(s)?`)) return;
    const res = await fetch(`/api/admin/offerwall/categories/${c.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      router.refresh();
    } else toast.error("Delete failed");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
        <p className="font-semibold text-slate-200">How categories work</p>
        Categories are the tabs users see on the offerwall page (e.g. <b>Games</b>, <b>Finance</b>,
        <b> Sign-ups</b>, <b>Surveys</b>). Offers are grouped under a category and unlock{" "}
        <b>one-by-one in the order you set</b>. Give each a name, an emoji icon, and a color.
      </div>

      {canManage && (
        <button
          onClick={startCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> New category
        </button>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {initial.length === 0 && (
          <p className="text-sm text-slate-500">No categories yet — create one to start adding offers.</p>
        )}
        {initial.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3"
          >
            <GripVertical className="w-4 h-4 text-slate-600 shrink-0" />
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg"
              style={{ background: (c.color ?? "#10b981") + "22" }}
            >
              {c.icon || "🎁"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white truncate">
                {c.name}{" "}
                {!c.isActive && <span className="text-xs text-amber-400">(hidden)</span>}
              </p>
              <p className="text-xs text-slate-500">
                {c.offerCount} offer(s) · order {c.order}
              </p>
            </div>
            {canManage && (
              <div className="flex gap-1 shrink-0">
                <button onClick={() => startEdit(c)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => remove(c)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">{editing ? "Edit category" : "New category"}</h3>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} placeholder="e.g. Games" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inp} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Icon (emoji)</label>
                <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} className={inp} placeholder="🎮" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Color</label>
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-full h-9 bg-slate-800 border border-slate-700 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Order</label>
                <input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) || 0 })} className={inp} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 accent-emerald-500" />
              Active (visible to users)
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-lg bg-slate-800 text-white text-sm">Cancel</button>
              <button onClick={save} disabled={busy} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
