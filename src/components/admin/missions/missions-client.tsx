"use client";

import { confirmDialog } from "@/lib/confirm";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Save, Target, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AdminTable,
  type AdminColumn,
} from "@/components/admin/ui/admin-table";

interface Mission {
  id: string;
  title: string;
  description: string | null;
  type: string;
  targetValue: number;
  pointsReward: number;
  cashReward: number;
  xpReward: number;
  duration: string;
  autoRefresh: boolean;
  requiredLevel: number;
  isActive: boolean;
}

interface Props {
  initial: Mission[];
  canManage: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  TASK_COMPLETION: "Complete tasks",
  LOGIN_STREAK: "Login streak",
  REFERRAL: "Refer users",
  SPEND: "Spend points",
  EARN: "Earn points",
};

export function MissionsClient({ initial, canManage }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Mission | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleActive = async (m: Mission) => {
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/admin/missions/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !m.isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(m.isActive ? "Deactivated" : "Activated");
      router.refresh();
    } catch (err) {
      toast.error("Failed to toggle", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (m: Mission) => {
    if (!(await confirmDialog({ title: `Delete "${m.title}"?`, description: "This cannot be undone.", tone: "danger", confirmLabel: "Delete" }))) return;
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/admin/missions/${m.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Mission deleted");
      router.refresh();
    } catch (err) {
      toast.error("Failed to delete", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const columns: AdminColumn<Mission>[] = [
    {
      key: "mission",
      header: "Mission",
      primary: true,
      cell: (m) => (
        <>
          <p className="text-white font-medium">{m.title}</p>
          {m.description && (
            <p className="text-xs text-slate-500 line-clamp-1">
              {m.description}
            </p>
          )}
        </>
      ),
    },
    {
      key: "type",
      header: "Type",
      className: "text-slate-300",
      cell: (m) => TYPE_LABELS[m.type] ?? m.type,
    },
    {
      key: "target",
      header: "Target",
      className: "tabular-nums",
      cell: (m) => m.targetValue,
    },
    {
      key: "reward",
      header: "Reward",
      cell: (m) => (
        <>
          <span className="text-amber-400 font-bold">{m.pointsReward}</span> pts
          {m.xpReward > 0 && (
            <span className="text-slate-500"> · {m.xpReward} XP</span>
          )}
        </>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      cell: (m) => (
        <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300">
          {m.duration}
        </span>
      ),
    },
    {
      key: "active",
      header: "Active",
      cell: (m) => (
        <button
          disabled={!canManage || busyId === m.id}
          onClick={() => toggleActive(m)}
          className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
            m.isActive
              ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
              : "bg-slate-700 text-slate-400 hover:bg-slate-600"
          } ${canManage ? "cursor-pointer" : "cursor-default"} disabled:opacity-50`}
        >
          {m.isActive ? "Active" : "Inactive"}
        </button>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "Actions",
            className: "text-right",
            cell: (m: Mission) => (
              <div className="inline-flex gap-1">
                <button
                  onClick={() => setEditing(m)}
                  className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-blue-400"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={busyId === m.id}
                  onClick={() => remove(m)}
                  className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 disabled:opacity-50"
                  title="Delete"
                >
                  {busyId === m.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ),
          } as AdminColumn<Mission>,
        ]
      : []),
  ];

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Mission
          </button>
        </div>
      )}

      <AdminTable<Mission>
        columns={columns}
        rows={initial}
        getRowKey={(m) => m.id}
        empty={
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
            <Target className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-medium text-white mb-1">
              No missions yet
            </h3>
          </div>
        }
      />

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
      {editing && (
        <EditModal
          mission={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EditModal({
  mission,
  onClose,
}: {
  mission: Mission;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: mission.title,
    description: mission.description ?? "",
    type: mission.type,
    targetValue: mission.targetValue,
    pointsReward: mission.pointsReward,
    xpReward: mission.xpReward,
    cashReward: mission.cashReward,
    duration: mission.duration,
    autoRefresh: mission.autoRefresh,
    requiredLevel: mission.requiredLevel,
    isActive: mission.isActive,
  });

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Title required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/missions/${mission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Mission updated");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Edit Mission</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6 space-y-3 overflow-y-auto">
          <Field label="Title *">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inp}
            />
          </Field>
          <Field label="Description">
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inp}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={inp}
              >
                <option value="TASK_COMPLETION">Task Completion</option>
                <option value="LOGIN_STREAK">Login Streak</option>
                <option value="REFERRAL">Referral</option>
                <option value="SPEND">Spend</option>
                <option value="EARN">Earn</option>
              </select>
            </Field>
            <Field label="Target Value">
              <input
                type="number"
                min={1}
                value={form.targetValue}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targetValue: parseInt(e.target.value) || 1,
                  })
                }
                className={inp}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Points">
              <input
                type="number"
                min={0}
                value={form.pointsReward}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pointsReward: parseInt(e.target.value) || 0,
                  })
                }
                className={inp}
              />
            </Field>
            <Field label="XP">
              <input
                type="number"
                min={0}
                value={form.xpReward}
                onChange={(e) =>
                  setForm({ ...form, xpReward: parseInt(e.target.value) || 0 })
                }
                className={inp}
              />
            </Field>
            <Field label="Cash ($)">
              <input
                type="number"
                step={0.01}
                min={0}
                value={form.cashReward}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cashReward: parseFloat(e.target.value) || 0,
                  })
                }
                className={inp}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration">
              <select
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                className={inp}
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </Field>
            <Field label="Required Level">
              <input
                type="number"
                min={1}
                max={100}
                value={form.requiredLevel}
                onChange={(e) =>
                  setForm({
                    ...form,
                    requiredLevel: parseInt(e.target.value) || 1,
                  })
                }
                className={inp}
              />
            </Field>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.autoRefresh}
                onChange={(e) =>
                  setForm({ ...form, autoRefresh: e.target.checked })
                }
                className="rounded bg-slate-800 border-slate-600 text-blue-500"
              />
              Auto-refresh
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
                className="rounded bg-slate-800 border-slate-600 text-blue-500"
              />
              Active
            </label>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "TASK_COMPLETION",
    targetValue: 5,
    pointsReward: 100,
    xpReward: 50,
    cashReward: 0,
    duration: "DAILY",
    autoRefresh: true,
    requiredLevel: 1,
    isActive: true,
  });

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Title required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Mission created");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">New Mission</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6 space-y-3 overflow-y-auto">
          <Field label="Title *">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inp}
              placeholder="e.g. Complete 5 tasks"
            />
          </Field>
          <Field label="Description">
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inp}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={inp}
              >
                <option value="TASK_COMPLETION">Task Completion</option>
                <option value="LOGIN_STREAK">Login Streak</option>
                <option value="REFERRAL">Referral</option>
                <option value="SPEND">Spend</option>
                <option value="EARN">Earn</option>
              </select>
            </Field>
            <Field label="Target Value">
              <input
                type="number"
                min={1}
                value={form.targetValue}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targetValue: parseInt(e.target.value) || 1,
                  })
                }
                className={inp}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Points">
              <input
                type="number"
                min={0}
                value={form.pointsReward}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pointsReward: parseInt(e.target.value) || 0,
                  })
                }
                className={inp}
              />
            </Field>
            <Field label="XP">
              <input
                type="number"
                min={0}
                value={form.xpReward}
                onChange={(e) =>
                  setForm({ ...form, xpReward: parseInt(e.target.value) || 0 })
                }
                className={inp}
              />
            </Field>
            <Field label="Cash ($)">
              <input
                type="number"
                step={0.01}
                min={0}
                value={form.cashReward}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cashReward: parseFloat(e.target.value) || 0,
                  })
                }
                className={inp}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration">
              <select
                value={form.duration}
                onChange={(e) =>
                  setForm({ ...form, duration: e.target.value })
                }
                className={inp}
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </Field>
            <Field label="Required Level">
              <input
                type="number"
                min={1}
                max={100}
                value={form.requiredLevel}
                onChange={(e) =>
                  setForm({
                    ...form,
                    requiredLevel: parseInt(e.target.value) || 1,
                  })
                }
                className={inp}
              />
            </Field>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.autoRefresh}
                onChange={(e) =>
                  setForm({ ...form, autoRefresh: e.target.checked })
                }
                className="rounded bg-slate-800 border-slate-600 text-blue-500"
              />
              Auto-refresh
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
                className="rounded bg-slate-800 border-slate-600 text-blue-500"
              />
              Active
            </label>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
