"use client";

import { confirmDialog } from "@/lib/confirm";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Layers,
  Plus,
  Loader2,
  X,
  Edit,
  Trash2,
  BarChart3,
  Lock,
  Users,
  Coins,
  Zap,
  Trophy,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { DateField } from "@/components/ui/date-field";
import {
  TaskAudienceTargeting,
  type TaskAudienceValue,
} from "@/components/admin/tasks/task-audience-targeting";

interface Board {
  id: string;
  title: string;
  description: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  category: string | null;
  expiresAt: string | Date | null;
  pointsReward: number;
  xpReward: number;
  isActive: boolean;
  order: number;
  unlockBoardId?: string | null;
  taskCount?: number;
  claimCount?: number;
  minLevel?: number;
  requiredAccessLevel?: number;
  countries?: string[];
  genders?: string[];
  regions?: string[];
  divisions?: string[];
  districts?: string[];
  subDistricts?: string[];
  postalCodes?: string[];
  minAge?: number | null;
  maxAge?: number | null;
}

interface AnalyticsData {
  taskCount: number;
  totalCompletions: number;
  totalClaims: number;
  pointsDistributed: number;
  xpDistributed: number;
  uniqueParticipants: number;
  recentClaims: Array<{
    id: string;
    pointsEarned: number;
    xpEarned: number;
    claimedAt: string;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    };
  }>;
}

const BOARD_CATEGORIES = [
  "Marketing",
  "Development",
  "Design",
  "Sales",
  "Learning",
  "Other",
] as const;

// Convert ISO datetime → "YYYY-MM-DDTHH:mm" for <input type="datetime-local">
function toDatetimeLocal(v: string | Date | null): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  initialBoards: Board[];
  canManage: boolean;
}

interface FormState {
  id?: string;
  title: string;
  description: string;
  iconEmoji: string;
  imageUrl: string;
  category: string; // "" | one of BOARD_CATEGORIES
  expiresAt: string; // datetime-local string, "" means no deadline
  pointsReward: number;
  xpReward: number;
  isActive: boolean;
  order: number;
  unlockBoardId: string; // "" means no prerequisite
  minLevel: number;
  requiredAccessLevel: number;
  audience: TaskAudienceValue;
}

/** Same nine dimensions as a Task. Empty array / null bound = no constraint. */
const EMPTY_BOARD_AUDIENCE: TaskAudienceValue = {
  countries: [],
  genders: [],
  regions: [],
  divisions: [],
  districts: [],
  subDistricts: [],
  postalCodes: [],
  minAge: null,
  maxAge: null,
};

const EMPTY: FormState = {
  title: "",
  description: "",
  iconEmoji: "📌",
  imageUrl: "",
  category: "",
  expiresAt: "",
  pointsReward: 1000,
  xpReward: 100,
  isActive: true,
  order: 0,
  unlockBoardId: "",
  minLevel: 1,
  requiredAccessLevel: 0,
  audience: { ...EMPTY_BOARD_AUDIENCE },
};

export function BoardsClient({ initialBoards, canManage }: Props) {
  const router = useRouter();
  const [boards, setBoards] = useState(initialBoards);
  const [modal, setModal] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [analyticsBoard, setAnalyticsBoard] = useState<Board | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const boardById = new Map(boards.map((b) => [b.id, b]));

  const openCreate = () => setModal({ ...EMPTY });
  const openEdit = (b: Board) =>
    setModal({
      id: b.id,
      title: b.title,
      description: b.description ?? "",
      iconEmoji: b.iconEmoji ?? "📌",
      imageUrl: b.imageUrl ?? "",
      category: b.category ?? "",
      expiresAt: toDatetimeLocal(b.expiresAt ?? null),
      pointsReward: b.pointsReward,
      xpReward: b.xpReward,
      isActive: b.isActive,
      order: b.order,
      unlockBoardId: b.unlockBoardId ?? "",
      minLevel: b.minLevel ?? 1,
      requiredAccessLevel: b.requiredAccessLevel ?? 0,
      audience: {
        countries: b.countries ?? [],
        genders: b.genders ?? [],
        regions: b.regions ?? [],
        divisions: b.divisions ?? [],
        districts: b.districts ?? [],
        subDistricts: b.subDistricts ?? [],
        postalCodes: b.postalCodes ?? [],
        minAge: b.minAge ?? null,
        maxAge: b.maxAge ?? null,
      },
    });
  const close = () => setModal(null);

  const openAnalytics = async (b: Board) => {
    setAnalyticsBoard(b);
    setAnalytics(null);
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/admin/boards/${b.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAnalytics(data.stats as AnalyticsData);
    } catch (err) {
      toast.error("Couldn't load analytics", {
        description: err instanceof Error ? err.message : String(err),
      });
      setAnalyticsBoard(null);
    } finally {
      setAnalyticsLoading(false);
    }
  };
  const closeAnalytics = () => {
    setAnalyticsBoard(null);
    setAnalytics(null);
  };

  const submit = async () => {
    if (!modal) return;
    if (modal.title.trim().length < 2) {
      toast.error("Title must be at least 2 characters");
      return;
    }
    setBusy(true);
    try {
      const isEdit = !!modal.id;
      const url = isEdit ? `/api/admin/boards/${modal.id}` : "/api/admin/boards";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: modal.title.trim(),
          description: modal.description.trim() || null,
          iconEmoji: modal.iconEmoji.trim() || null,
          imageUrl: modal.imageUrl.trim() || null,
          category: modal.category || null,
          expiresAt: modal.expiresAt
            ? new Date(modal.expiresAt).toISOString()
            : null,
          pointsReward: modal.pointsReward,
          xpReward: modal.xpReward,
          isActive: modal.isActive,
          order: modal.order,
          unlockBoardId: modal.unlockBoardId || null,
          minLevel: modal.minLevel,
          requiredAccessLevel: modal.requiredAccessLevel,
          ...modal.audience,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(isEdit ? "Board updated" : "Board created");

      if (isEdit) {
        setBoards((prev) =>
          prev.map((b) => (b.id === modal.id ? { ...b, ...data.board } : b))
        );
      } else {
        setBoards((prev) => [...prev, { ...data.board, taskCount: 0 }]);
      }
      close();
      router.refresh();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b: Board) => {
    if (
      !(await confirmDialog({
        title: `Delete "${b.title}"?`,
        description: "Tasks will be detached from this board.",
        tone: "danger",
        confirmLabel: "Delete",
      }))
    )
      return;
    try {
      const res = await fetch(`/api/admin/boards/${b.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setBoards((prev) => prev.filter((x) => x.id !== b.id));
      toast.success("Board deleted");
      router.refresh();
    } catch (err) {
      toast.error("Delete failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Layers className="w-6 h-6 text-purple-400" />
            Task Boards
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Group related tasks into boards with bonus completion rewards.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Create Board
          </button>
        )}
      </div>

      {boards.length === 0 ? (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
          <Layers className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-1">No boards yet</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Create curated task collections like &quot;Crypto Challenge&quot; or
            &quot;Beginner Bundle&quot;. Users earn a bonus reward when they
            complete every task in the board.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map((b) => (
            <div
              key={b.id}
              className={`rounded-xl border p-5 transition-colors ${
                b.isActive
                  ? "border-slate-800 bg-slate-900 hover:border-purple-500/50"
                  : "border-slate-800 bg-slate-900/50 opacity-60"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                {b.iconEmoji && (
                  <span className="text-2xl">{b.iconEmoji}</span>
                )}
                <h3 className="text-white font-semibold flex-1 min-w-0 truncate">
                  {b.title}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    b.isActive
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {b.isActive ? "ACTIVE" : "OFF"}
                </span>
              </div>
              {b.description && (
                <p className="text-sm text-slate-400 mb-3 line-clamp-2">
                  {b.description}
                </p>
              )}
              {b.unlockBoardId && (
                <div className="mb-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  <Lock className="w-3 h-3" />
                  Unlocks after &quot;
                  {boardById.get(b.unlockBoardId)?.title ?? "Unknown board"}
                  &quot;
                </div>
              )}
              <div className="flex items-center justify-between text-sm pt-3 border-t border-slate-800">
                <div>
                  <p className="text-amber-400 font-bold tabular-nums">
                    {b.pointsReward.toLocaleString()} pts
                  </p>
                  <p className="text-xs text-slate-500">
                    {b.xpReward > 0 ? `+${b.xpReward} XP · ` : ""}
                    {b.taskCount ?? 0} tasks · {b.claimCount ?? 0} claims
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openAnalytics(b)}
                    className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-slate-800 rounded transition-colors"
                    title="Analytics"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                  {canManage && (
                    <>
                      <button
                        onClick={() => openEdit(b)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(b)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <Link
                    href={`/admin/boards/${b.id}`}
                    className="text-xs text-blue-400 hover:underline ml-2"
                  >
                    Manage tasks →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {analyticsBoard && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeAnalytics}
          />
          <div className="relative bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <button
              onClick={closeAnalytics}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-1">
              {analyticsBoard.iconEmoji && (
                <span className="text-2xl">{analyticsBoard.iconEmoji}</span>
              )}
              <h2 className="text-lg font-semibold text-white truncate">
                {analyticsBoard.title}
              </h2>
            </div>
            <p className="text-sm text-slate-400 mb-4 inline-flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4" />
              Analytics &amp; recent activity
            </p>

            {analyticsLoading && (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}

            {!analyticsLoading && analytics && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Stat
                    icon={<Trophy className="w-4 h-4 text-amber-400" />}
                    label="Total Claims"
                    value={analytics.totalClaims.toLocaleString()}
                  />
                  <Stat
                    icon={<Users className="w-4 h-4 text-indigo-400" />}
                    label="Unique Participants"
                    value={analytics.uniqueParticipants.toLocaleString()}
                  />
                  <Stat
                    icon={<Coins className="w-4 h-4 text-amber-400" />}
                    label="Points Distributed"
                    value={analytics.pointsDistributed.toLocaleString()}
                  />
                  <Stat
                    icon={<Zap className="w-4 h-4 text-indigo-400" />}
                    label="XP Distributed"
                    value={analytics.xpDistributed.toLocaleString()}
                  />
                </div>
                <Stat
                  icon={<Layers className="w-4 h-4 text-purple-400" />}
                  label="Task Completions"
                  value={`${analytics.totalCompletions.toLocaleString()} across ${analytics.taskCount} task${analytics.taskCount === 1 ? "" : "s"}`}
                  full
                />

                <div>
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Recent Claims
                  </h3>
                  {analytics.recentClaims.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">
                      No claims yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {analytics.recentClaims.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-slate-950 border border-slate-800"
                        >
                          {c.user.image ? (
                            <SmartImage
                              src={c.user.image}
                              alt=""
                              width={32}
                              height={32}
                              className="w-8 h-8 rounded-full object-cover bg-slate-800"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-300 font-bold">
                              {(c.user.name ?? c.user.email ?? "?")
                                .slice(0, 1)
                                .toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">
                              {c.user.name ?? c.user.email ?? "Unknown user"}
                            </p>
                            <p className="text-[11px] text-slate-500 tabular-nums">
                              {new Date(c.claimedAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-amber-400 tabular-nums">
                              +{c.pointsEarned.toLocaleString()} pts
                            </p>
                            <p className="text-[10px] text-indigo-400 tabular-nums">
                              +{c.xpEarned} XP
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={busy ? undefined : close}
          />
          <div className="relative bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <button
              onClick={close}
              disabled={busy}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-white mb-1">
              {modal.id ? "Edit Board" : "Create Board"}
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              {modal.id
                ? "Update board details and rewards."
                : "Group related tasks into a themed collection."}
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-[80px_1fr] gap-3">
                <Field label="Icon">
                  <input
                    value={modal.iconEmoji}
                    onChange={(e) =>
                      setModal({ ...modal, iconEmoji: e.target.value })
                    }
                    placeholder="📌"
                    maxLength={4}
                    className={`${inp} text-center text-xl`}
                  />
                </Field>
                <Field label="Title">
                  <input
                    value={modal.title}
                    onChange={(e) =>
                      setModal({ ...modal, title: e.target.value })
                    }
                    placeholder="Crypto Challenge"
                    className={inp}
                  />
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  value={modal.description}
                  onChange={(e) =>
                    setModal({ ...modal, description: e.target.value })
                  }
                  rows={3}
                  placeholder="Complete all crypto-themed tasks for a bonus reward."
                  className={inp}
                />
              </Field>

              <Field label="Banner Image (optional)">
                <ImageUploadField
                  value={modal.imageUrl}
                  onChange={(url) => setModal({ ...modal, imageUrl: url })}
                  title="Select Board Banner"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <select
                    value={modal.category}
                    onChange={(e) =>
                      setModal({ ...modal, category: e.target.value })
                    }
                    className={inp}
                  >
                    <option value="">— None</option>
                    {BOARD_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Deadline (optional)">
                  <DateField
                    type="datetime-local"
                    value={modal.expiresAt}
                    onChange={(v) =>
                      setModal({ ...modal, expiresAt: v })
                    }
                    className={inp}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Bonus Points">
                  <input
                    type="number"
                    min={0}
                    value={modal.pointsReward}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        pointsReward: parseInt(e.target.value) || 0,
                      })
                    }
                    className={inp}
                  />
                </Field>
                <Field label="Bonus XP">
                  <input
                    type="number"
                    min={0}
                    value={modal.xpReward}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        xpReward: parseInt(e.target.value) || 0,
                      })
                    }
                    className={inp}
                  />
                </Field>
              </div>

              <Field label="Display Order (lower = earlier)">
                <input
                  type="number"
                  value={modal.order}
                  onChange={(e) =>
                    setModal({ ...modal, order: parseInt(e.target.value) || 0 })
                  }
                  className={inp}
                />
              </Field>

              <Field label="Prerequisite Board (optional)">
                <select
                  value={modal.unlockBoardId}
                  onChange={(e) =>
                    setModal({ ...modal, unlockBoardId: e.target.value })
                  }
                  className={inp}
                >
                  <option value="">— None (always unlocked)</option>
                  {boards
                    .filter((b) => b.id !== modal.id)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.iconEmoji ? `${b.iconEmoji} ` : ""}
                        {b.title}
                      </option>
                    ))}
                </select>
                {modal.unlockBoardId && (
                  <p className="text-[11px] text-amber-300 mt-1">
                    🔒 Users must first claim the selected board before this
                    one becomes available.
                  </p>
                )}
              </Field>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modal.isActive}
                  onChange={(e) =>
                    setModal({ ...modal, isActive: e.target.checked })
                  }
                  className="rounded bg-slate-800 border-slate-600 text-emerald-500"
                />
                <span className="text-sm text-white">Active (visible to users)</span>
              </label>

              {/* ── Who can see this board ────────────────────────────────
                  A board had no per-user gate at all: every active board was
                  listed to everyone, and a board whose tasks were targeted
                  elsewhere just showed "0 tasks" and refused to be claimed. */}
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <p className="text-sm font-bold text-white">Who can see this board</p>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Minimum level">
                    <input
                      type="number"
                      min={1}
                      value={modal.minLevel}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          minLevel: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      className={inp}
                    />
                  </Field>
                  <Field label="Minimum plan tier (0 = free)">
                    <input
                      type="number"
                      min={0}
                      value={modal.requiredAccessLevel}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          requiredAccessLevel: Math.max(
                            0,
                            parseInt(e.target.value) || 0
                          ),
                        })
                      }
                      className={inp}
                    />
                  </Field>
                </div>

                <TaskAudienceTargeting
                  value={modal.audience}
                  onChange={(patch) =>
                    setModal({
                      ...modal,
                      audience: { ...modal.audience, ...patch },
                    })
                  }
                  disabled={!canManage}
                />

                <p className="text-[11px] text-slate-500">
                  Leave everything blank to show this board to all users.
                  Targeting is strict — a user whose profile is missing a
                  targeted field (no country set, no date of birth) will not see
                  the board.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-800">
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
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {modal.id ? "Save Changes" : "Create Board"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function Stat({
  icon,
  label,
  value,
  full,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  full?: boolean;
}) {
  return (
    <div
      className={`rounded-lg bg-slate-950 border border-slate-800 p-3 ${
        full ? "col-span-2" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
          {label}
        </p>
      </div>
      <p className="text-base font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}
