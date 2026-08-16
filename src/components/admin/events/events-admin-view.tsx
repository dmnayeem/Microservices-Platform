"use client";

import { useEffect, useState } from "react";
import { Sparkles, Plus, Loader2, Trash2, Power } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { EVENT_ACTION_META, type EventActionType } from "@/lib/events-shared";

interface AdminEvent {
  id: string;
  title: string;
  description: string | null;
  actionType: EventActionType;
  threshold: number;
  rewardPoints: number;
  rewardXp: number;
  requiredAccessLevel: number;
  startAt: string;
  endAt: string;
  isActive: boolean;
  _count?: { progress: number };
}

const ACTION_KEYS = Object.keys(EVENT_ACTION_META) as EventActionType[];

interface Tier {
  threshold: number;
  rewardPoints: number;
  rewardXp: number;
}

const emptyForm = () => ({
  title: "",
  description: "",
  actionType: "TASK_COMPLETE" as EventActionType,
  threshold: 1,
  rewardPoints: 100,
  rewardXp: 0,
  requiredAccessLevel: 0,
  startAt: "",
  endAt: "",
  tiers: [] as Tier[],
});

export function EventsAdminView({ canManage }: { canManage: boolean }) {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/events", { cache: "no-store" });
      const d = await r.json();
      setEvents(d.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const r = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      toast.success("Event created");
      setForm(emptyForm());
      setShowForm(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create event");
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (ev: AdminEvent) => {
    const r = await fetch(`/api/admin/events/${ev.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !ev.isActive }),
    });
    if (r.ok) {
      setEvents((prev) =>
        prev.map((e) => (e.id === ev.id ? { ...e, isActive: !e.isActive } : e))
      );
    } else toast.error("Couldn't update");
  };

  const remove = async (ev: AdminEvent) => {
    if (
      !(await confirmDialog({
        title: "Delete event?",
        description: `"${ev.title}" and all its progress will be removed.`,
        tone: "danger",
        confirmLabel: "Delete",
      }))
    )
      return;
    const r = await fetch(`/api/admin/events/${ev.id}`, { method: "DELETE" });
    if (r.ok) {
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
      toast.success("Event deleted");
    } else toast.error("Couldn't delete");
  };

  const field =
    "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-400" /> Events
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Time-boxed challenges. Users hit a target action count in the window,
            then claim the reward.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> New event
          </button>
        )}
      </div>

      {showForm && canManage && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={field}
              placeholder="Title (e.g. Invite 10 friends today)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <select
              className={field}
              value={form.actionType}
              onChange={(e) =>
                setForm({ ...form, actionType: e.target.value as EventActionType })
              }
            >
              {ACTION_KEYS.map((k) => (
                <option key={k} value={k}>
                  {EVENT_ACTION_META[k].label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className={field}
            placeholder="Description (optional)"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs text-slate-400">
              Target ({EVENT_ACTION_META[form.actionType].unit})
              <input
                type="number"
                min={1}
                className={field}
                value={form.threshold}
                onChange={(e) =>
                  setForm({ ...form, threshold: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-xs text-slate-400">
              Reward points
              <input
                type="number"
                min={0}
                className={field}
                value={form.rewardPoints}
                onChange={(e) =>
                  setForm({ ...form, rewardPoints: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-xs text-slate-400">
              Reward XP
              <input
                type="number"
                min={0}
                className={field}
                value={form.rewardXp}
                onChange={(e) =>
                  setForm({ ...form, rewardXp: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-xs text-slate-400">
              Min access level
              <input
                type="number"
                min={0}
                className={field}
                value={form.requiredAccessLevel}
                onChange={(e) =>
                  setForm({
                    ...form,
                    requiredAccessLevel: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>

          {/* Optional reward tiers (multi-tier, e.g. 10→X, 20→Y). When set, the
              single Target/Reward above is ignored in favour of these. */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-300">
                Reward tiers (optional)
              </p>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    tiers: [
                      ...form.tiers,
                      { threshold: 10, rewardPoints: 100, rewardXp: 0 },
                    ],
                  })
                }
                className="text-[11px] font-semibold text-indigo-400 hover:underline"
              >
                + Add tier
              </button>
            </div>
            {form.tiers.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                No tiers — single target/reward is used. Add tiers for “reach N →
                bonus, reach M → bigger bonus”.
              </p>
            ) : (
              form.tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    placeholder="target"
                    className={field}
                    value={t.threshold}
                    onChange={(e) => {
                      const tiers = [...form.tiers];
                      tiers[i] = { ...t, threshold: Number(e.target.value) };
                      setForm({ ...form, tiers });
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="points"
                    className={field}
                    value={t.rewardPoints}
                    onChange={(e) => {
                      const tiers = [...form.tiers];
                      tiers[i] = { ...t, rewardPoints: Number(e.target.value) };
                      setForm({ ...form, tiers });
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="xp"
                    className={field}
                    value={t.rewardXp}
                    onChange={(e) => {
                      const tiers = [...form.tiers];
                      tiers[i] = { ...t, rewardXp: Number(e.target.value) };
                      setForm({ ...form, tiers });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        tiers: form.tiers.filter((_, j) => j !== i),
                      })
                    }
                    className="p-2 rounded-lg text-slate-400 hover:text-red-400 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Starts
              <input
                type="datetime-local"
                className={field}
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
              />
            </label>
            <label className="text-xs text-slate-400">
              Ends
              <input
                type="datetime-local"
                className={field}
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
              />
            </label>
          </div>
          <button
            onClick={create}
            disabled={creating}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Create event
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">
          No events yet.
        </p>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => {
            const now = Date.now();
            const live =
              ev.isActive &&
              new Date(ev.startAt).getTime() <= now &&
              new Date(ev.endAt).getTime() >= now;
            return (
              <div
                key={ev.id}
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {ev.title}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {EVENT_ACTION_META[ev.actionType].label} · target{" "}
                    {ev.threshold} · +{ev.rewardPoints}p
                    {ev.rewardXp ? ` / +${ev.rewardXp}xp` : ""} ·{" "}
                    {new Date(ev.startAt).toLocaleDateString()}–
                    {new Date(ev.endAt).toLocaleDateString()} ·{" "}
                    {ev._count?.progress ?? 0} claimed
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    live
                      ? "bg-emerald-500/15 text-emerald-400"
                      : ev.isActive
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {live ? "LIVE" : ev.isActive ? "SCHEDULED" : "OFF"}
                </span>
                {canManage && (
                  <>
                    <button
                      onClick={() => toggle(ev)}
                      title={ev.isActive ? "Disable" : "Enable"}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(ev)}
                      title="Delete"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
