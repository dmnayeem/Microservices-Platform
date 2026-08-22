"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Save, Rocket, Pencil, Trash2 } from "lucide-react";
import { confirmDialog } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  AdminTable,
  type AdminColumn,
} from "@/components/admin/ui/admin-table";
import { DateField } from "@/components/ui/date-field";
import {
  TaskAudienceTargeting,
  type TaskAudienceValue,
} from "@/components/admin/tasks/task-audience-targeting";
import {
  EVENT_ACTION_TYPES,
  EVENT_ACTION_META,
  type EventActionType,
  type EventTier,
} from "@/lib/events-shared";

/**
 * Missions admin.
 *
 * The create and edit forms used to be two separate ~170-line components with
 * the same body — the exact arrangement where a new field gets added to one and
 * forgotten in the other. There is now one `MissionModal` for both.
 */

export interface AdminMission {
  id: string;
  title: string;
  description: string | null;
  iconEmoji: string | null;
  actionType: EventActionType;
  targetValue: number;
  tiers: EventTier[];
  pointsReward: number;
  cashReward: number;
  xpReward: number;
  dailyCap: number;
  startAt: string | null;
  endAt: string | null;
  order: number;
  unlockMissionId: string | null;
  requiredLevel: number;
  requiredAccessLevel: number;
  isActive: boolean;
  countries: string[];
  genders: string[];
  regions: string[];
  divisions: string[];
  districts: string[];
  subDistricts: string[];
  postalCodes: string[];
  minAge: number | null;
  maxAge: number | null;
  /** How many users have progress — shown so deletes aren't a surprise. */
  participants?: number;
}

interface Props {
  initial: AdminMission[];
  canManage: boolean;
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-60";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-300 mb-1">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

function toDatetimeLocal(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MissionsClient({ initial, canManage }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<AdminMission | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleActive = async (m: AdminMission) => {
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/admin/missions/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !m.isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
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

  const remove = async (m: AdminMission) => {
    const hasProgress = (m.participants ?? 0) > 0;
    const okToGo = await confirmDialog({
      title: hasProgress ? `Deactivate "${m.title}"?` : `Delete "${m.title}"?`,
      description: hasProgress
        ? `${m.participants} user${m.participants === 1 ? " has" : "s have"} progress on this mission, so it will be deactivated instead of deleted — their progress is kept.`
        : "Nobody has started this mission yet, so it will be deleted. This cannot be undone.",
      tone: "danger",
      confirmLabel: hasProgress ? "Deactivate" : "Delete",
    });
    if (!okToGo) return;
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/admin/missions/${m.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      toast.success(d.message ?? "Mission deleted");
      router.refresh();
    } catch (err) {
      toast.error("Failed to delete", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const columns: AdminColumn<AdminMission>[] = [
    {
      key: "mission",
      header: "Mission",
      primary: true,
      cell: (m) => (
        <>
          <p className="text-white font-medium">
            {m.iconEmoji ? `${m.iconEmoji} ` : ""}
            {m.title}
          </p>
          {m.description && (
            <p className="text-xs text-slate-500 line-clamp-1">{m.description}</p>
          )}
        </>
      ),
    },
    {
      key: "goal",
      header: "Goal",
      className: "text-slate-300",
      cell: (m) => (
        <>
          {EVENT_ACTION_META[m.actionType]?.label ?? m.actionType}
          <span className="block text-xs text-slate-500 tabular-nums">
            {m.tiers.length > 0
              ? `${m.tiers.length} tiers · up to ${m.tiers[m.tiers.length - 1].threshold}`
              : `${m.targetValue} ${EVENT_ACTION_META[m.actionType]?.unit ?? ""}`}
          </span>
        </>
      ),
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
      key: "who",
      header: "Who",
      cell: (m) => {
        const targeted =
          m.countries.length ||
          m.genders.length ||
          m.regions.length ||
          m.divisions.length ||
          m.districts.length ||
          m.subDistricts.length ||
          m.postalCodes.length ||
          m.minAge != null ||
          m.maxAge != null;
        return (
          <span className="text-xs text-slate-400">
            {targeted ? "Targeted" : "Everyone"}
            {m.requiredLevel > 1 && ` · Lv${m.requiredLevel}+`}
            {m.requiredAccessLevel > 0 && ` · Tier${m.requiredAccessLevel}+`}
          </span>
        );
      },
    },
    {
      key: "participants",
      header: "Players",
      className: "tabular-nums text-slate-300",
      cell: (m) => m.participants ?? 0,
    },
    {
      key: "active",
      header: "Active",
      cell: (m) => (
        <button
          disabled={!canManage || busyId === m.id}
          onClick={() => toggleActive(m)}
          className={cn(
            "px-2 py-0.5 rounded-full text-xs transition-colors disabled:opacity-50",
            m.isActive
              ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
              : "bg-slate-700 text-slate-400 hover:bg-slate-600",
            canManage ? "cursor-pointer" : "cursor-default"
          )}
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
            cell: (m: AdminMission) => (
              <div className="inline-flex gap-1">
                <button
                  onClick={() => setModal(m)}
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
          } as AdminColumn<AdminMission>,
        ]
      : []),
  ];

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setModal("new")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Mission
          </button>
        </div>
      )}

      <AdminTable<AdminMission>
        columns={columns}
        rows={initial}
        getRowKey={(m) => m.id}
        empty={
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
            <Rocket className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-medium text-white mb-1">
              No missions yet
            </h3>
            <p className="text-sm text-slate-500">
              Missions are the platform&apos;s biggest rewards — set a goal worth
              chasing.
            </p>
          </div>
        }
      />

      {modal && (
        <MissionModal
          mission={modal === "new" ? null : modal}
          allMissions={initial}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// ── One modal for create AND edit ────────────────────────────────────────────

interface FormState {
  title: string;
  description: string;
  iconEmoji: string;
  actionType: EventActionType;
  targetValue: number;
  tiers: EventTier[];
  pointsReward: number;
  xpReward: number;
  cashReward: number;
  dailyCap: number;
  startAt: string;
  endAt: string;
  order: number;
  unlockMissionId: string;
  requiredLevel: number;
  requiredAccessLevel: number;
  isActive: boolean;
  audience: TaskAudienceValue;
}

function formFrom(m: AdminMission | null): FormState {
  return {
    title: m?.title ?? "",
    description: m?.description ?? "",
    iconEmoji: m?.iconEmoji ?? "🏆",
    actionType: m?.actionType ?? "TASK_COMPLETE",
    targetValue: m?.targetValue ?? 10,
    tiers: m?.tiers ?? [],
    pointsReward: m?.pointsReward ?? 1000,
    xpReward: m?.xpReward ?? 100,
    cashReward: m?.cashReward ?? 0,
    dailyCap: m?.dailyCap ?? 0,
    startAt: toDatetimeLocal(m?.startAt ?? null),
    endAt: toDatetimeLocal(m?.endAt ?? null),
    order: m?.order ?? 0,
    unlockMissionId: m?.unlockMissionId ?? "",
    requiredLevel: m?.requiredLevel ?? 1,
    requiredAccessLevel: m?.requiredAccessLevel ?? 0,
    isActive: m?.isActive ?? true,
    audience: {
      countries: m?.countries ?? [],
      genders: m?.genders ?? [],
      regions: m?.regions ?? [],
      divisions: m?.divisions ?? [],
      districts: m?.districts ?? [],
      subDistricts: m?.subDistricts ?? [],
      postalCodes: m?.postalCodes ?? [],
      minAge: m?.minAge ?? null,
      maxAge: m?.maxAge ?? null,
    },
  };
}

function MissionModal({
  mission,
  allMissions,
  onClose,
}: {
  mission: AdminMission | null;
  allMissions: AdminMission[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(() => formFrom(mission));
  const isEdit = !!mission;
  const meta = EVENT_ACTION_META[form.actionType];
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // The final tier is what completes the mission and unlocks the next one, so
  // the plain target must line up with it or the chain never advances.
  const effectiveTarget =
    form.tiers.length > 0
      ? Math.max(...form.tiers.map((t) => t.threshold))
      : form.targetValue;

  const submit = async () => {
    if (form.title.trim().length < 2) {
      toast.error("Title must be at least 2 characters");
      return;
    }
    if (form.tiers.some((t) => t.threshold < 1)) {
      toast.error("Every tier needs a target of at least 1");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        isEdit ? `/api/admin/missions/${mission!.id}` : "/api/admin/missions",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            description: form.description.trim() || null,
            iconEmoji: form.iconEmoji.trim() || null,
            actionType: form.actionType,
            targetValue: effectiveTarget,
            tiers: form.tiers.length > 0 ? form.tiers : null,
            pointsReward: form.pointsReward,
            xpReward: form.xpReward,
            cashReward: form.cashReward,
            dailyCap: form.dailyCap,
            startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
            endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
            order: form.order,
            unlockMissionId: form.unlockMissionId || null,
            requiredLevel: form.requiredLevel,
            requiredAccessLevel: form.requiredAccessLevel,
            isActive: form.isActive,
            ...form.audience,
          }),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(isEdit ? "Mission updated" : "Mission created");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Couldn't save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Edit mission" : "New mission"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <Field label="Icon">
              <input
                value={form.iconEmoji}
                onChange={(e) => set({ iconEmoji: e.target.value })}
                className={cn(inp, "text-center text-lg")}
                maxLength={8}
              />
            </Field>
            <Field label="Title">
              <input
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                className={inp}
                placeholder="e.g. Invite 50 friends"
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
              className={inp}
              placeholder="What the user has to do, and why it's worth it."
            />
          </Field>

          {/* ── The goal ── */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <p className="text-sm font-bold text-white">What counts</p>
            <Field label="Action" hint={meta?.hint}>
              <select
                value={form.actionType}
                onChange={(e) =>
                  set({ actionType: e.target.value as EventActionType })
                }
                className={inp}
              >
                {EVENT_ACTION_TYPES.filter(
                  (t) => !EVENT_ACTION_META[t]?.deprecated && t !== "UPLOAD_PROOF"
                ).map((t) => (
                  <option key={t} value={t} className="bg-slate-900">
                    {EVENT_ACTION_META[t]?.label ?? t}
                  </option>
                ))}
              </select>
            </Field>

            {form.tiers.length === 0 && (
              <div className="grid grid-cols-3 gap-3">
                <Field label={`Target (${meta?.unit ?? "actions"})`}>
                  <input
                    type="number"
                    min={1}
                    value={form.targetValue}
                    onChange={(e) =>
                      set({ targetValue: Math.max(1, parseInt(e.target.value) || 1) })
                    }
                    className={inp}
                  />
                </Field>
                <Field label="Points reward">
                  <input
                    type="number"
                    min={0}
                    value={form.pointsReward}
                    onChange={(e) =>
                      set({ pointsReward: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                    className={inp}
                  />
                </Field>
                <Field label="XP reward">
                  <input
                    type="number"
                    min={0}
                    value={form.xpReward}
                    onChange={(e) =>
                      set({ xpReward: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                    className={inp}
                  />
                </Field>
              </div>
            )}

            {/* Tiers */}
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-300">
                  Reward tiers{" "}
                  <span className="font-normal text-slate-500">
                    (optional — each claims separately)
                  </span>
                </p>
                <button
                  onClick={() =>
                    set({
                      tiers: [
                        ...form.tiers,
                        {
                          threshold:
                            (form.tiers.at(-1)?.threshold ?? 0) +
                            Math.max(1, form.targetValue),
                          rewardPoints: form.pointsReward,
                          rewardXp: form.xpReward,
                        },
                      ],
                    })
                  }
                  className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                  + Add tier
                </button>
              </div>
              {form.tiers.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No tiers — one target, one reward. Add tiers to keep users
                  coming back for the next milestone.
                </p>
              ) : (
                form.tiers.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                    <input
                      type="number"
                      min={1}
                      value={t.threshold}
                      onChange={(e) => {
                        const next = [...form.tiers];
                        next[i] = {
                          ...t,
                          threshold: Math.max(1, parseInt(e.target.value) || 1),
                        };
                        set({ tiers: next });
                      }}
                      className={inp}
                      placeholder="target"
                    />
                    <input
                      type="number"
                      min={0}
                      value={t.rewardPoints}
                      onChange={(e) => {
                        const next = [...form.tiers];
                        next[i] = {
                          ...t,
                          rewardPoints: Math.max(0, parseInt(e.target.value) || 0),
                        };
                        set({ tiers: next });
                      }}
                      className={inp}
                      placeholder="pts"
                    />
                    <input
                      type="number"
                      min={0}
                      value={t.rewardXp}
                      onChange={(e) => {
                        const next = [...form.tiers];
                        next[i] = {
                          ...t,
                          rewardXp: Math.max(0, parseInt(e.target.value) || 0),
                        };
                        set({ tiers: next });
                      }}
                      className={inp}
                      placeholder="xp"
                    />
                    <button
                      onClick={() =>
                        set({ tiers: form.tiers.filter((_, j) => j !== i) })
                      }
                      className="p-2 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                      aria-label="Remove tier"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
              {form.tiers.length > 0 && (
                <p className="text-[11px] text-slate-500">
                  Target/points/XP per tier. The highest tier ({effectiveTarget}{" "}
                  {meta?.unit}) completes the mission and unlocks anything chained
                  to it.
                </p>
              )}
            </div>

            <Field
              label="Daily cap (0 = unlimited)"
              hint="Most actions a user can bank toward this mission in one day. Set it for anything a user controls freely, like posting."
            >
              <input
                type="number"
                min={0}
                value={form.dailyCap}
                onChange={(e) =>
                  set({ dailyCap: Math.max(0, parseInt(e.target.value) || 0) })
                }
                className={inp}
              />
            </Field>
          </div>

          {/* ── Scheduling + chain ── */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <p className="text-sm font-bold text-white">When &amp; order</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts (optional)">
                <DateField
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(v) => set({ startAt: v })}
                  className={inp}
                />
              </Field>
              <Field label="Ends (optional)">
                <DateField
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(v) => set({ endAt: v })}
                  className={inp}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Display order (lower = earlier)">
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => set({ order: parseInt(e.target.value) || 0 })}
                  className={inp}
                />
              </Field>
              <Field label="Unlocked by (optional)">
                <select
                  value={form.unlockMissionId}
                  onChange={(e) => set({ unlockMissionId: e.target.value })}
                  className={inp}
                >
                  <option value="">— None (always available)</option>
                  {allMissions
                    .filter((x) => x.id !== mission?.id)
                    .map((x) => (
                      <option key={x.id} value={x.id} className="bg-slate-900">
                        {x.iconEmoji ? `${x.iconEmoji} ` : ""}
                        {x.title}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
          </div>

          {/* ── Who can see it ── */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <p className="text-sm font-bold text-white">Who can see this mission</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minimum level">
                <input
                  type="number"
                  min={1}
                  value={form.requiredLevel}
                  onChange={(e) =>
                    set({ requiredLevel: Math.max(1, parseInt(e.target.value) || 1) })
                  }
                  className={inp}
                />
              </Field>
              <Field label="Minimum plan tier (0 = free)">
                <input
                  type="number"
                  min={0}
                  value={form.requiredAccessLevel}
                  onChange={(e) =>
                    set({
                      requiredAccessLevel: Math.max(0, parseInt(e.target.value) || 0),
                    })
                  }
                  className={inp}
                />
              </Field>
            </div>

            <TaskAudienceTargeting
              value={form.audience}
              onChange={(patch) =>
                set({ audience: { ...form.audience, ...patch } })
              }
            />
            <p className="text-[11px] text-slate-500">
              Leave blank to show this mission to everyone. Targeting is strict —
              a user whose profile is missing a targeted field (no country, no
              date of birth) will not see it.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set({ isActive: e.target.checked })}
              className="rounded bg-slate-800 border-slate-600 text-emerald-500"
            />
            <span className="text-sm text-white">Active (visible to users)</span>
          </label>
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isEdit ? "Save changes" : "Create mission"}
          </button>
        </div>
      </div>
    </div>
  );
}
