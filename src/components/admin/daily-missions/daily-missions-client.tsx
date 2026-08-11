"use client";

import { confirmDialog } from "@/lib/confirm";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Target,
  Plus,
  X,
  Loader2,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  Users,
  Sparkles,
  Coins,
  Zap,
  GripVertical,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const TASK_TYPES = [
  "ARTICLE",
  "VIDEO",
  "QUIZ",
  "SURVEY",
  "SOCIAL",
  "PROXY",
  "OFFERWALL",
  "BOARD",
  "MANUAL",
  "CUSTOM",
  // Social-feed engagement goals — count feed likes/comments/etc. the user
  // performs today (e.g. "like 100 posts"). Progress is tracked from
  // SocialActionLog by daily-mission-progress.ts.
  "SOCIAL_LIKE",
  "SOCIAL_COMMENT",
  "SOCIAL_POST",
  "SOCIAL_SHARE",
  "SOCIAL_VOTE",
] as const;

const PACKAGE_TIERS = ["FREE", "STARTER", "PRO", "ELITE", "VIP"] as const;
type PackageTier = (typeof PACKAGE_TIERS)[number];
type TaskType = (typeof TASK_TYPES)[number];

const TIER_COLOR: Record<PackageTier, string> = {
  FREE: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  STARTER: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  PRO: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
  ELITE: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  VIP: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

interface MissionItem {
  id?: string;
  taskType: TaskType;
  description: string | null;
  targetCount: number;
  xpPerComplete: number;
  pointsPerComplete: number;
  duration: number | null;
  requiredLevel: number | null;
  order: number;
}

interface Mission {
  id: string;
  name: string;
  description: string | null;
  packageTier: PackageTier;
  requiredLevel: number;
  completionXpReward: number;
  completionPointsReward: number;
  isActive: boolean;
  autoRefresh: boolean;
  linkReferralBonus: boolean;
  order: number;
  claimsCount: number;
  items: MissionItem[];
}

interface FormState {
  id?: string;
  name: string;
  description: string;
  packageTier: PackageTier;
  requiredLevel: number;
  completionXpReward: number;
  completionPointsReward: number;
  isActive: boolean;
  autoRefresh: boolean;
  linkReferralBonus: boolean;
  order: number;
  items: MissionItem[];
}

const EMPTY_ITEM: MissionItem = {
  taskType: "ARTICLE",
  description: "",
  targetCount: 1,
  xpPerComplete: 10,
  pointsPerComplete: 50,
  duration: null,
  requiredLevel: null,
  order: 0,
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  packageTier: "FREE",
  requiredLevel: 1,
  completionXpReward: 100,
  completionPointsReward: 500,
  isActive: true,
  autoRefresh: true,
  linkReferralBonus: false,
  order: 0,
  items: [{ ...EMPTY_ITEM }],
};

interface Props {
  initial: Mission[];
  canManage: boolean;
}

export function DailyMissionsClient({ initial, canManage }: Props) {
  const router = useRouter();
  const [missions, setMissions] = useState(initial);
  const [modal, setModal] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const out = new Map<PackageTier, Mission[]>();
    for (const tier of PACKAGE_TIERS) out.set(tier, []);
    for (const m of missions) out.get(m.packageTier)?.push(m);
    return out;
  }, [missions]);

  const openCreate = () => setModal({ ...EMPTY_FORM });
  const openEdit = (m: Mission) =>
    setModal({
      id: m.id,
      name: m.name,
      description: m.description ?? "",
      packageTier: m.packageTier,
      requiredLevel: m.requiredLevel,
      completionXpReward: m.completionXpReward,
      completionPointsReward: m.completionPointsReward,
      isActive: m.isActive,
      autoRefresh: m.autoRefresh,
      linkReferralBonus: m.linkReferralBonus,
      order: m.order,
      items: m.items.map((it) => ({ ...it })),
    });
  const close = () => setModal(null);

  const submit = async () => {
    if (!modal) return;
    if (modal.name.trim().length < 2) {
      toast.error("Mission name must be at least 2 characters");
      return;
    }
    if (modal.items.length === 0) {
      toast.error("Add at least one task item");
      return;
    }
    setBusy(true);
    try {
      const isEdit = !!modal.id;
      const url = isEdit ? `/api/admin/daily-missions/${modal.id}` : "/api/admin/daily-missions";
      const method = isEdit ? "PATCH" : "POST";
      const payload = {
        name: modal.name.trim(),
        description: modal.description.trim() || null,
        packageTier: modal.packageTier,
        requiredLevel: modal.requiredLevel,
        completionXpReward: modal.completionXpReward,
        completionPointsReward: modal.completionPointsReward,
        isActive: modal.isActive,
        autoRefresh: modal.autoRefresh,
        linkReferralBonus: modal.linkReferralBonus,
        order: modal.order,
        items: modal.items.map((it, idx) => ({
          taskType: it.taskType,
          description: it.description?.trim() || null,
          targetCount: it.targetCount,
          xpPerComplete: it.xpPerComplete,
          pointsPerComplete: it.pointsPerComplete,
          duration: it.duration,
          requiredLevel: it.requiredLevel,
          order: idx,
        })),
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(isEdit ? "Mission updated" : "Mission created");
      close();
      router.refresh();
      // Refresh list (simple: refetch)
      const listRes = await fetch("/api/admin/daily-missions");
      if (listRes.ok) {
        const d = await listRes.json();
        setMissions(d.missions ?? []);
      }
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: Mission) => {
    if (
      !(await confirmDialog({
        title: `Delete mission "${m.name}"?`,
        description: "All claims associated with it will be deleted.",
        tone: "danger",
        confirmLabel: "Delete",
      }))
    )
      return;
    setBusyDeleteId(m.id);
    try {
      const res = await fetch(`/api/admin/daily-missions/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setMissions((prev) => prev.filter((x) => x.id !== m.id));
      toast.success("Mission deleted");
      router.refresh();
    } catch (err) {
      toast.error("Delete failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyDeleteId(null);
    }
  };

  const addItem = () => {
    if (!modal) return;
    setModal({
      ...modal,
      items: [...modal.items, { ...EMPTY_ITEM, order: modal.items.length }],
    });
  };

  const removeItem = (idx: number) => {
    if (!modal) return;
    setModal({
      ...modal,
      items: modal.items.filter((_, i) => i !== idx),
    });
  };

  const updateItem = (idx: number, patch: Partial<MissionItem>) => {
    if (!modal) return;
    setModal({
      ...modal,
      items: modal.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-400" />
            Daily Task Missions
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Per-package daily missions. Users complete every bucket to claim the
            final reward (and unlock the daily referral bonus when linked).
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            New Mission
          </button>
        )}
      </div>

      {missions.length === 0 ? (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
          <Target className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-1">No daily missions yet</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Create per-package mission templates that bundle several
            &ldquo;complete N tasks of type X&rdquo; buckets for users to chase
            every day.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {PACKAGE_TIERS.map((tier) => {
            const tierMissions = grouped.get(tier) ?? [];
            if (tierMissions.length === 0) return null;
            const isCollapsed = collapsed[tier];
            return (
              <div key={tier} className="space-y-2">
                <button
                  onClick={() =>
                    setCollapsed((p) => ({ ...p, [tier]: !p[tier] }))
                  }
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left",
                    TIER_COLOR[tier]
                  )}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  <span className="text-sm font-bold uppercase tracking-wider">
                    {tier}
                  </span>
                  <span className="ml-auto text-xs opacity-80">
                    {tierMissions.length} mission
                    {tierMissions.length === 1 ? "" : "s"}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pl-2">
                    {tierMissions.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "rounded-xl border bg-slate-900 p-4",
                          m.isActive ? "border-slate-800" : "border-slate-800 opacity-60"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h3 className="text-sm font-bold text-white truncate">
                            {m.name}
                          </h3>
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold",
                              m.isActive
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-slate-700 text-slate-400"
                            )}
                          >
                            {m.isActive ? "Active" : "Off"}
                          </span>
                        </div>
                        {m.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                            {m.description}
                          </p>
                        )}
                        <div className="space-y-1 mb-3">
                          {m.items.slice(0, 4).map((it) => (
                            <div
                              key={it.id ?? `${it.taskType}-${it.order}`}
                              className="flex items-center gap-2 text-xs text-slate-300"
                            >
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] uppercase tracking-wider font-bold">
                                {it.taskType}
                              </span>
                              <span className="tabular-nums">×{it.targetCount}</span>
                              <span className="text-amber-400 ml-auto tabular-nums">
                                +{it.pointsPerComplete}
                              </span>
                            </div>
                          ))}
                          {m.items.length > 4 && (
                            <p className="text-[10px] text-slate-500">
                              + {m.items.length - 4} more…
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="inline-flex items-center gap-0.5 text-amber-400 font-bold tabular-nums">
                              <Coins className="w-3 h-3" />
                              {m.completionPointsReward}
                            </span>
                            <span className="inline-flex items-center gap-0.5 text-purple-400 tabular-nums">
                              <Zap className="w-3 h-3" />
                              {m.completionXpReward}
                            </span>
                            <span className="inline-flex items-center gap-0.5 text-slate-400 tabular-nums">
                              <Users className="w-3 h-3" />
                              {m.claimsCount}
                            </span>
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openEdit(m)}
                                className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => remove(m)}
                                disabled={busyDeleteId === m.id}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
                                title="Delete"
                              >
                                {busyDeleteId === m.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                        {m.linkReferralBonus && (
                          <p className="mt-2 text-[10px] text-amber-400 inline-flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Gates daily referral bonus
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={busy ? undefined : close}
          />
          <div className="relative bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-white">
                {modal.id ? "Edit Mission" : "Create Daily Mission"}
              </h2>
              <button
                onClick={close}
                disabled={busy}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              {/* Header fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Mission Name *">
                  <input
                    value={modal.name}
                    onChange={(e) => setModal({ ...modal, name: e.target.value })}
                    placeholder="Pro Daily Pack #1"
                    className={inp}
                  />
                </Field>
                <Field label="Package Tier *">
                  <select
                    value={modal.packageTier}
                    onChange={(e) =>
                      setModal({ ...modal, packageTier: e.target.value as PackageTier })
                    }
                    className={inp}
                  >
                    {PACKAGE_TIERS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  rows={2}
                  value={modal.description}
                  onChange={(e) => setModal({ ...modal, description: e.target.value })}
                  placeholder="What's the theme of this daily mission?"
                  className={inp}
                />
              </Field>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Required Level">
                  <input
                    type="number"
                    min={0}
                    value={modal.requiredLevel}
                    onChange={(e) =>
                      setModal({ ...modal, requiredLevel: parseInt(e.target.value) || 0 })
                    }
                    className={inp}
                  />
                </Field>
                <Field label="Completion XP">
                  <input
                    type="number"
                    min={0}
                    value={modal.completionXpReward}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        completionXpReward: parseInt(e.target.value) || 0,
                      })
                    }
                    className={inp}
                  />
                </Field>
                <Field label="Completion Points">
                  <input
                    type="number"
                    min={0}
                    value={modal.completionPointsReward}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        completionPointsReward: parseInt(e.target.value) || 0,
                      })
                    }
                    className={inp}
                  />
                </Field>
                <Field label="Display Order">
                  <input
                    type="number"
                    value={modal.order}
                    onChange={(e) =>
                      setModal({ ...modal, order: parseInt(e.target.value) || 0 })
                    }
                    className={inp}
                  />
                </Field>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Toggle
                  label="Active"
                  hint="Visible to users"
                  checked={modal.isActive}
                  onChange={(v) => setModal({ ...modal, isActive: v })}
                />
                <Toggle
                  label="Auto-refresh"
                  hint="Reset progress daily"
                  checked={modal.autoRefresh}
                  onChange={(v) => setModal({ ...modal, autoRefresh: v })}
                />
                <Toggle
                  label="Gate Referral Bonus"
                  hint="Block daily referral claim until done"
                  checked={modal.linkReferralBonus}
                  onChange={(v) => setModal({ ...modal, linkReferralBonus: v })}
                />
              </div>

              {/* Items list */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white">
                    Task Items ({modal.items.length})
                  </h3>
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  {modal.items.map((it, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-slate-600" />
                        <span className="text-xs uppercase tracking-wider font-bold text-slate-400">
                          Item #{idx + 1}
                        </span>
                        {modal.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="ml-auto p-1 text-slate-500 hover:text-red-400 rounded"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <Field label="Task Type">
                          <select
                            value={it.taskType}
                            onChange={(e) =>
                              updateItem(idx, { taskType: e.target.value as TaskType })
                            }
                            className={inp}
                          >
                            {TASK_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Target Count">
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={it.targetCount}
                            onChange={(e) =>
                              updateItem(idx, {
                                targetCount: parseInt(e.target.value) || 1,
                              })
                            }
                            className={inp}
                          />
                        </Field>
                        <Field label="Duration (min)">
                          <input
                            type="number"
                            min={0}
                            value={it.duration ?? ""}
                            onChange={(e) =>
                              updateItem(idx, {
                                duration: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                            placeholder="Optional"
                            className={inp}
                          />
                        </Field>
                      </div>

                      <Field label="Description (shown to user)">
                        <input
                          value={it.description ?? ""}
                          onChange={(e) =>
                            updateItem(idx, { description: e.target.value })
                          }
                          placeholder="e.g. Read 3 articles to earn extra rewards"
                          className={inp}
                        />
                      </Field>

                      <div className="grid grid-cols-3 gap-2">
                        <Field label="XP / complete">
                          <input
                            type="number"
                            min={0}
                            value={it.xpPerComplete}
                            onChange={(e) =>
                              updateItem(idx, {
                                xpPerComplete: parseInt(e.target.value) || 0,
                              })
                            }
                            className={inp}
                          />
                        </Field>
                        <Field label="Points / complete">
                          <input
                            type="number"
                            min={0}
                            value={it.pointsPerComplete}
                            onChange={(e) =>
                              updateItem(idx, {
                                pointsPerComplete: parseInt(e.target.value) || 0,
                              })
                            }
                            className={inp}
                          />
                        </Field>
                        <Field label="Required Level">
                          <input
                            type="number"
                            min={0}
                            value={it.requiredLevel ?? ""}
                            onChange={(e) =>
                              updateItem(idx, {
                                requiredLevel: e.target.value
                                  ? parseInt(e.target.value)
                                  : null,
                              })
                            }
                            placeholder="Optional"
                            className={inp}
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-800">
              <button
                onClick={close}
                disabled={busy}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {modal.id ? "Save Changes" : "Create Mission"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-700 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded bg-slate-800 border-slate-600 text-indigo-500"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      </div>
    </label>
  );
}
