"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/games-admin";

export interface AdminGameCategory {
  id: string;
  name: string;
  slug: string;
  order: number;
  isActive: boolean;
  gameCount: number;
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500";

/**
 * Manage the game taxonomy.
 *
 * Categories used to be a free-text box on each game, so "Puzzle", "puzzle" and
 * "Puzzles" were three categories and the user-facing catalog had no way to
 * filter by any of them.
 */
export function GameCategoriesModal({
  categories,
  onClose,
}: {
  categories: AdminGameCategory[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/games/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, slug: slugify(trimmed) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't add");
      setName("");
      toast.success("Category added");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't add", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: AdminGameCategory) => {
    const ok = await confirmDialog({
      title: `Delete "${c.name}"?`,
      description:
        c.gameCount > 0
          ? `${c.gameCount} game${c.gameCount === 1 ? "" : "s"} will become uncategorised. The games themselves are not deleted.`
          : "Nothing uses this category.",
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/admin/games/categories/${c.id}`, {
        method: "DELETE",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't delete");
      toast.success(d.message ?? "Category deleted");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't delete", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const toggle = async (c: AdminGameCategory) => {
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/admin/games/categories/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't update", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-md my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">Game categories</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="e.g. Puzzle"
              className={inp}
            />
            <button
              onClick={add}
              disabled={busy || !name.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm disabled:opacity-50 shrink-0"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
          {name.trim() && (
            <p className="text-[11px] text-slate-500">
              URL slug: <code className="text-slate-400">{slugify(name) || "—"}</code>
            </p>
          )}

          {categories.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No categories yet. Games without one appear as &ldquo;uncategorised&rdquo;.
            </p>
          ) : (
            <div className="space-y-2">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800",
                    !c.isActive && "opacity-60"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {c.gameCount} game{c.gameCount === 1 ? "" : "s"} · /{c.slug}
                    </p>
                  </div>
                  <button
                    onClick={() => toggle(c)}
                    disabled={busyId === c.id}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs transition-colors disabled:opacity-50",
                      c.isActive
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-slate-700 text-slate-400"
                    )}
                  >
                    {c.isActive ? "Active" : "Hidden"}
                  </button>
                  <button
                    onClick={() => remove(c)}
                    disabled={busyId === c.id}
                    className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                    aria-label={`Delete ${c.name}`}
                  >
                    {busyId === c.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
