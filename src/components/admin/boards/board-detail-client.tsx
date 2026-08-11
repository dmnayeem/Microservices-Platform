"use client";

import { confirmDialog } from "@/lib/confirm";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Layers,
  Plus,
  Minus,
  Loader2,
  CheckCheck,
  Search,
  Users,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  type: string;
  status: string;
  pointsReward: number;
  xpReward: number;
  completedCount?: number;
}

interface BoardSummary {
  id: string;
  title: string;
  description: string | null;
  iconEmoji: string | null;
  pointsReward: number;
  xpReward: number;
  isActive: boolean;
}

interface Props {
  board: BoardSummary;
  assignedTasks: Task[];
  availableTasks: Task[];
  stats: { taskCount: number; totalCompletions: number };
  canManage: boolean;
}

export function BoardDetailClient({
  board,
  assignedTasks: initialAssigned,
  availableTasks: initialAvailable,
  stats,
  canManage,
}: Props) {
  const router = useRouter();
  const [assigned, setAssigned] = useState(initialAssigned);
  const [available, setAvailable] = useState(initialAvailable);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? available.filter((t) => t.title.toLowerCase().includes(q))
      : available;
  }, [available, search]);

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const assignSelected = async () => {
    if (picked.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(picked);
      const res = await fetch(`/api/admin/boards/${board.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const moved = available.filter((t) => picked.has(t.id));
      setAvailable((prev) => prev.filter((t) => !picked.has(t.id)));
      setAssigned((prev) => [...prev, ...moved]);
      setPicked(new Set());
      toast.success(`${data.assigned} task${data.assigned === 1 ? "" : "s"} assigned`);
      router.refresh();
    } catch (err) {
      toast.error("Assign failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const removeTask = async (task: Task) => {
    if (
      !(await confirmDialog({
        title: `Remove "${task.title}" from this board?`,
        description: "It will return to the unassigned pool.",
        tone: "info",
        confirmLabel: "Remove",
      }))
    )
      return;
    try {
      const res = await fetch(`/api/admin/boards/${board.id}/tasks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: [task.id] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setAssigned((prev) => prev.filter((t) => t.id !== task.id));
      setAvailable((prev) => [{ ...task }, ...prev]);
      toast.success("Removed from board");
      router.refresh();
    } catch (err) {
      toast.error("Remove failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const totalReward = assigned.reduce((s, t) => s + t.pointsReward, 0);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/boards"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to boards
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-slate-800 bg-linear-to-br from-purple-500/5 via-slate-900 to-slate-900 p-5">
        <div className="flex items-start gap-4">
          <div className="text-4xl">{board.iconEmoji || "📌"}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white truncate">
                {board.title}
              </h1>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold",
                  board.isActive
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-slate-700 text-slate-400"
                )}
              >
                {board.isActive ? "Active" : "Off"}
              </span>
            </div>
            {board.description && (
              <p className="text-sm text-slate-400 mt-1">{board.description}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <Stat label="Bonus Reward" value={`${board.pointsReward.toLocaleString()} pts`} />
          <Stat label="Bonus XP" value={`+${board.xpReward}`} />
          <Stat label="Tasks" value={String(stats.taskCount)} />
          <Stat
            label="Completions"
            value={String(stats.totalCompletions)}
            icon={<Users className="w-3.5 h-3.5 text-indigo-400" />}
          />
        </div>
      </div>

      {/* Assigned tasks */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-base font-semibold text-white mb-1 inline-flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-400" />
          Assigned Tasks ({assigned.length})
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Cumulative reward when all done: {board.pointsReward.toLocaleString()} pts
          (board) + {totalReward.toLocaleString()} pts (per-task) = {(board.pointsReward + totalReward).toLocaleString()} pts.
        </p>
        {assigned.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-lg">
            No tasks assigned yet. Pick from the pool below.
          </p>
        ) : (
          <div className="space-y-2">
            {assigned.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800"
              >
                <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                  {t.type}
                </span>
                <span className="flex-1 text-sm text-white truncate">
                  {t.title}
                </span>
                <span className="text-xs text-amber-400 font-bold tabular-nums shrink-0">
                  +{t.pointsReward}
                </span>
                {canManage && (
                  <button
                    onClick={() => removeTask(t)}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded transition-colors"
                    title="Remove from board"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available pool */}
      {canManage && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-base font-semibold text-white">
              Add Tasks to Board
            </h2>
            <button
              onClick={assignSelected}
              disabled={busy || picked.size === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCheck className="w-4 h-4" />
              )}
              Assign {picked.size > 0 ? `(${picked.size})` : ""}
            </button>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search unassigned tasks…"
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          {filteredAvailable.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-lg">
              {available.length === 0
                ? "All active tasks are assigned to a board."
                : "No tasks match your search."}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
              {filteredAvailable.map((t) => {
                const isPicked = picked.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => togglePick(t.id)}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors",
                      isPicked
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-slate-800 bg-slate-950 hover:border-slate-700"
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                        isPicked
                          ? "bg-blue-500 border-blue-500 text-white"
                          : "border-slate-600"
                      )}
                    >
                      {isPicked && <Plus className="w-3 h-3" />}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
                      {t.type}
                    </span>
                    <span className="flex-1 text-sm text-white truncate">
                      {t.title}
                    </span>
                    <span className="text-xs text-amber-400 font-bold tabular-nums shrink-0">
                      +{t.pointsReward}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-slate-950 border border-slate-800 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold inline-flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm font-bold text-white tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
