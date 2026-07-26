"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, Gamepad2, X } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { SmartImage } from "@/components/user/primitives/smart-image";

export interface AdminGame {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  iconUrl: string;
  embedUrl: string;
  order: number;
  isActive: boolean;
  playsCount: number;
}

const inp =
  "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500";

export function GamesClient({
  initial,
  canManage,
}: {
  initial: AdminGame[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<AdminGame | "new" | null>(null);

  const del = async (g: AdminGame) => {
    if (!(await confirmDialog({ title: `Delete "${g.title}"?`, tone: "danger", confirmLabel: "Delete" })))
      return;
    const res = await fetch(`/api/admin/games/${g.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Failed to delete");
    toast.success("Game deleted");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <button
          onClick={() => setModal("new")}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> New Game
        </button>
      )}

      {initial.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No games yet. Add one to start.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {initial.map((g) => (
            <div key={g.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3 flex gap-3">
              <div className="relative w-14 h-14 rounded-xl bg-slate-950 overflow-hidden shrink-0 grid place-items-center">
                {g.iconUrl ? (
                  <SmartImage src={g.iconUrl} alt="" fill sizes="56px" className="object-cover" />
                ) : (
                  <Gamepad2 className="w-6 h-6 text-slate-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{g.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {g.category && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold uppercase">
                      {g.category}
                    </span>
                  )}
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      g.isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {g.isActive ? "Active" : "Off"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                  {g.playsCount.toLocaleString()} plays · order {g.order}
                </p>
              </div>
              {canManage && (
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => setModal(g)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => del(g)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <GameModal
          game={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function GameModal({
  game,
  onClose,
  onSaved,
}: {
  game: AdminGame | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: game?.title ?? "",
    category: game?.category ?? "",
    description: game?.description ?? "",
    iconUrl: game?.iconUrl ?? "",
    embedUrl: game?.embedUrl ?? "",
    order: game?.order ?? 0,
    isActive: game?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title required");
    if (!form.iconUrl) return toast.error("Icon required");
    if (!form.embedUrl.trim()) return toast.error("Embed URL required");
    setBusy(true);
    try {
      const res = await fetch(game ? `/api/admin/games/${game.id}` : "/api/admin/games", {
        method: game ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success(game ? "Game updated" : "Game created");
      onSaved();
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="w-full max-w-lg my-8 rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h3 className="font-bold text-white">{game ? "Edit Game" : "New Game"}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Puzzle" className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Icon *</label>
            <ImageUploadField value={form.iconUrl} onChange={(url) => setForm({ ...form, iconUrl: url })} previewSize="square" title="Select game icon" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Embed URL * (the game link)</label>
            <input value={form.embedUrl} onChange={(e) => setForm({ ...form, embedUrl: e.target.value })} placeholder="https://…" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${inp} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Order</label>
              <input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })} className={inp} />
            </div>
            <label className="flex items-center gap-2 mt-5 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 accent-emerald-500" />
              <span className="text-sm text-slate-300">Active</span>
            </label>
          </div>
          <button onClick={save} disabled={busy} className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {game ? "Save changes" : "Create game"}
          </button>
        </div>
      </div>
    </div>
  );
}
