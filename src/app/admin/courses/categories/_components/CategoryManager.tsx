"use client";

import { confirmDialog } from "@/lib/confirm";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Loader2, Plus, Save, Trash2, Edit3, X } from "lucide-react";
import { AdminTable } from "@/components/admin/ui/admin-table";

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  color: string | null;
  order: number;
  isActive: boolean;
  courseCount: number;
}

interface Props {
  initial: CategoryRow[];
  canManage: boolean;
}

export function CategoryManager({ initial, canManage }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const refresh = () => startTransition(() => router.refresh());
  const editingRow = initial.find((c) => c.id === editingId) ?? null;

  const remove = async (row: CategoryRow) => {
    if (
      !(await confirmDialog({
        title: `Delete category "${row.name}"?`,
        description:
          "This cannot be undone. Existing courses must be moved off this category first.",
        tone: "danger",
        confirmLabel: "Delete",
      }))
    ) {
      return;
    }
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/courses/categories/${row.id}`, {
        method: "DELETE",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Category deleted");
      refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm"
          >
            <Plus className="w-4 h-4" />
            New category
          </button>
        </div>
      )}

      {creating && (
        <CategoryForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}

      {editingRow && (
        <CategoryForm
          initial={editingRow}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            refresh();
          }}
        />
      )}

      <AdminTable<CategoryRow>
        rows={initial}
        getRowKey={(c) => c.id}
        empty={
          <div className="glass p-10 text-center text-slate-500">
            No categories yet. Create the first one to enable tutor and admin
            course filing.
          </div>
        }
        columns={[
          {
            key: "order",
            header: "Order",
            cell: (c) => (
              <span className="text-slate-400 tabular-nums">{c.order}</span>
            ),
          },
          {
            key: "name",
            header: "Name",
            primary: true,
            cell: (c) => (
              <div>
                <p className="text-white font-medium">{c.name}</p>
                {c.description && (
                  <p className="text-xs text-slate-500 max-w-md truncate">
                    {c.description}
                  </p>
                )}
              </div>
            ),
          },
          {
            key: "slug",
            header: "Slug",
            cell: (c) => (
              <span className="text-slate-300 font-mono text-xs">{c.slug}</span>
            ),
          },
          {
            key: "color",
            header: "Color",
            cell: (c) =>
              c.color ? (
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="text-xs text-slate-400 font-mono">
                    {c.color}
                  </span>
                </div>
              ) : (
                <span className="text-slate-600 text-xs">—</span>
              ),
          },
          {
            key: "courses",
            header: "Courses",
            cell: (c) => (
              <span className="text-slate-300 tabular-nums">
                {c.courseCount}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (c) =>
              c.isActive ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-medium">
                  Active
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400 text-xs font-medium">
                  Inactive
                </span>
              ),
          },
          {
            key: "actions",
            header: "Actions",
            className: "text-right",
            cell: (c) =>
              canManage ? (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setEditingId(c.id);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-indigo-300 hover:bg-indigo-500/10 text-xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    disabled={busyId === c.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-rose-300 hover:bg-rose-500/10 text-xs disabled:opacity-50"
                  >
                    {busyId === c.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Delete
                  </button>
                </div>
              ) : null,
          },
        ]}
      />
    </div>
  );
}

function CategoryForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: CategoryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [iconKey, setIconKey] = useState(initial?.iconKey ?? "");
  const [color, setColor] = useState(initial?.color ?? "#6366f1");
  const [order, setOrder] = useState(String(initial?.order ?? 0));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      toast.error("Slug: lowercase letters / numbers / dashes only");
      return;
    }
    setBusy(true);
    try {
      const body = {
        slug,
        name,
        description: description || null,
        iconKey: iconKey || null,
        color: color || null,
        order: Number(order) || 0,
        isActive,
      };
      const res = await fetch(
        initial
          ? `/api/admin/courses/categories/${initial.id}`
          : `/api/admin/courses/categories`,
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(initial ? "Category updated" : "Category created");
      onSaved();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-indigo-500/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">
          {initial ? "Edit category" : "New category"}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Name *">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="Web Development"
          />
        </Field>
        <Field label="Slug *">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            className={inputCls + " font-mono"}
            placeholder="web-development"
          />
        </Field>
        <Field label="Order">
          <input
            type="number"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            min={0}
            className={inputCls + " tabular-nums"}
          />
        </Field>
        <Field label="Color (hex)">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 bg-slate-950 border border-slate-700 rounded-lg cursor-pointer"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className={inputCls + " font-mono flex-1"}
              placeholder="#6366f1"
            />
          </div>
        </Field>
        <Field label="Icon key (lucide name, optional)">
          <input
            type="text"
            value={iconKey}
            onChange={(e) => setIconKey(e.target.value)}
            className={inputCls}
            placeholder="Code"
          />
        </Field>
        <Field label="Status">
          <label className="inline-flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={400}
              className={inputCls + " resize-none"}
            />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {initial ? "Save" : "Create"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
