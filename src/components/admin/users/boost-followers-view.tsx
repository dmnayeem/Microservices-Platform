"use client";

import { confirmDialog } from "@/lib/confirm";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Users,
  Filter,
  Loader2,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Bell,
  Undo2,
  History,
  Globe,
  MapPin,
  UserCheck,
  Award,
  Cake,
  Crown,
  Slash,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Avatar as AvatarPrimitive } from "@/components/user/primitives/avatar";
import { AdminTableShell } from "@/components/admin/ui/admin-table-shell";

interface Props {
  userId: string;
  userName: string;
  avatar: string | null;
  realFollowers: number;
  displayBoost: number;
}

interface FilterState {
  gender: string;          // "" | "Male" | "Female" | "Other"
  country: string;
  city: string;
  packageTier: string;     // "" | "FREE" | ...
  isBlueVerified: "" | "yes" | "no";
  levelMin: string;
  levelMax: string;
  ageMin: string;
  ageMax: string;
  excludeAdmins: boolean;
}

const EMPTY_FILTER: FilterState = {
  gender: "",
  country: "",
  city: "",
  packageTier: "",
  isBlueVerified: "",
  levelMin: "",
  levelMax: "",
  ageMin: "",
  ageMax: "",
  excludeAdmins: true,
};

interface SampleUser {
  id: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
  country: string | null;
  city: string | null;
  gender: string | null;
  packageTier: string;
  level: number;
}

interface PreviewResp {
  matchingCount: number;
  cap: number;
  sample: SampleUser[];
}

interface CountedValue {
  value: string;
  count: number;
}

interface FilterOptions {
  countries: CountedValue[];
  cities: CountedValue[];
  genderCounts: { male: number; female: number; other: number };
  packageTierCounts: Record<string, number>;
  blueVerifiedCounts: { yes: number; no: number };
  totalActiveUsers: number;
}

interface BoostBatch {
  id: string;
  criteria: Record<string, unknown>;
  mode: "ALL" | "RANDOM";
  requestedCount: number;
  addedCount: number;
  notifyTarget: boolean;
  status: "APPLIED" | "REVERTED";
  performedBy: string | null;
  createdAt: string;
  revertedAt: string | null;
}

const PACKAGE_TIERS = ["FREE", "STARTER", "PRO", "ELITE", "VIP"] as const;

export function BoostFollowersView({
  userId,
  userName,
  avatar,
  realFollowers,
  displayBoost,
}: Props) {
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Admin specifies how many followers to add. Defaults to "all matching" once
  // a preview returns; admin can tweak it.
  const [amount, setAmount] = useState<string>("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [notifyTarget, setNotifyTarget] = useState(false);

  const [applying, setApplying] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [appliedFlash, setAppliedFlash] = useState<{ count: number } | null>(
    null
  );

  const [batches, setBatches] = useState<BoostBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const previewAbortRef = useRef<AbortController | null>(null);

  // ── Load filter options once ────────────────────────────────────────────
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/admin/users/${userId}/boost-followers/filter-options`
        );
        if (!r.ok) return;
        const d = (await r.json()) as FilterOptions;
        if (!cancel) setOptions(d);
      } finally {
        if (!cancel) setOptionsLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [userId]);

  // ── Build filter payload ─────────────────────────────────────────────────
  const buildFilter = useCallback(() => {
    const f: Record<string, unknown> = { excludeAdmins: filter.excludeAdmins };
    if (filter.gender) f.gender = filter.gender;
    if (filter.country) f.country = filter.country;
    if (filter.city) f.city = filter.city;
    if (filter.packageTier) f.packageTier = filter.packageTier;
    if (filter.isBlueVerified === "yes") f.isBlueVerified = true;
    if (filter.isBlueVerified === "no") f.isBlueVerified = false;
    if (filter.levelMin) f.levelMin = parseInt(filter.levelMin, 10);
    if (filter.levelMax) f.levelMax = parseInt(filter.levelMax, 10);
    if (filter.ageMin) f.ageMin = parseInt(filter.ageMin, 10);
    if (filter.ageMax) f.ageMax = parseInt(filter.ageMax, 10);
    return f;
  }, [filter]);

  // ── Auto-preview with debounce + abort ──────────────────────────────────
  const runPreview = useCallback(
    async (signal?: AbortSignal) => {
      setPreviewing(true);
      try {
        const res = await fetch(
          `/api/admin/users/${userId}/boost-followers/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filter: buildFilter() }),
            signal,
          }
        );
        if (signal?.aborted) return;
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        setPreview(d as PreviewResp);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        toast.error("Preview failed", {
          description: err instanceof Error ? err.message : "Try again",
        });
      } finally {
        if (!signal?.aborted) setPreviewing(false);
      }
    },
    [userId, buildFilter]
  );

  useEffect(() => {
    // Debounce filter changes; abort in-flight requests on rapid changes.
    if (previewAbortRef.current) {
      previewAbortRef.current.abort();
    }
    const ctrl = new AbortController();
    previewAbortRef.current = ctrl;
    const t = setTimeout(() => {
      runPreview(ctrl.signal);
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filter.gender,
    filter.country,
    filter.city,
    filter.packageTier,
    filter.isBlueVerified,
    filter.levelMin,
    filter.levelMax,
    filter.ageMin,
    filter.ageMax,
    filter.excludeAdmins,
  ]);

  // ── Batches ──────────────────────────────────────────────────────────────
  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const r = await fetch(
        `/api/admin/users/${userId}/boost-followers/batches`
      );
      const d = await r.json();
      if (r.ok) setBatches(d.batches ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingBatches(false);
    }
  }, [userId]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const revertBatch = async (batch: BoostBatch) => {
    if (
      !(await confirmDialog({
        title: "Revert this batch?",
        description: `This will remove ${batch.addedCount.toLocaleString()} followers added on ${format(
          new Date(batch.createdAt),
          "PP p"
        )}. The Follow rows will be deleted and counters decremented.`,
        tone: "danger",
        confirmLabel: "Revert",
      }))
    ) {
      return;
    }
    setRevertingId(batch.id);
    try {
      const r = await fetch(
        `/api/admin/users/${userId}/boost-followers/batches/${batch.id}`,
        { method: "DELETE" }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success(
        `Reverted — removed ${d.removedCount.toLocaleString()} followers`
      );
      loadBatches();
      runPreview();
    } catch (err) {
      toast.error("Revert failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setRevertingId(null);
    }
  };

  // ── Apply ────────────────────────────────────────────────────────────────
  const apply = async () => {
    setApplying(true);
    try {
      const n = parseInt(amount, 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error("Enter how many followers to add");
      }
      const body = {
        filter: buildFilter(),
        amount: n,
        notifyTarget,
      };
      const res = await fetch(
        `/api/admin/users/${userId}/boost-followers/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(
        `Added ${d.addedCount.toLocaleString()} followers to ${userName}`,
        {
          description: notifyTarget
            ? "Target notified."
            : "Silent — target not notified.",
        }
      );
      setShowConfirm(false);
      setAppliedFlash({ count: d.addedCount });
      setTimeout(() => setAppliedFlash(null), 1800);
      // Reset amount so next round defaults to the new "all matching"
      setAmount("");
      setAmountTouched(false);
      runPreview();
      loadBatches();
    } catch (err) {
      toast.error("Apply failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setApplying(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const matchingCount = preview?.matchingCount ?? 0;
  const cap = preview?.cap ?? 10000;
  const maxAddable = Math.min(matchingCount, cap);
  const overCap = matchingCount > cap;

  const filterCount = useMemo(() => {
    let n = 0;
    if (filter.gender) n++;
    if (filter.country) n++;
    if (filter.city) n++;
    if (filter.packageTier) n++;
    if (filter.isBlueVerified) n++;
    if (filter.levelMin || filter.levelMax) n++;
    if (filter.ageMin || filter.ageMax) n++;
    if (!filter.excludeAdmins) n++;
    return n;
  }, [filter]);
  const hasFilter = filterCount > 0;

  // Auto-fill amount with maxAddable when preview returns and admin hasn't typed
  useEffect(() => {
    if (!amountTouched && preview && hasFilter && maxAddable > 0) {
      setAmount(String(maxAddable));
    }
    if (!hasFilter) {
      setAmount("");
      setAmountTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, hasFilter, maxAddable]);

  const parsedAmount = parseInt(amount, 10);
  const validAmount =
    Number.isFinite(parsedAmount) && parsedAmount > 0
      ? Math.min(parsedAmount, maxAddable)
      : 0;
  const amountTooHigh =
    Number.isFinite(parsedAmount) && parsedAmount > maxAddable && maxAddable > 0;

  const batchStats = useMemo(() => {
    let added = 0;
    let reverted = 0;
    for (const b of batches) {
      if (b.status === "REVERTED") reverted++;
      else added += b.addedCount;
    }
    return { total: batches.length, added, reverted };
  }, [batches]);

  // ── Render ───────────────────────────────────────────────────────────────
  const initial = (userName ?? "U").charAt(0).toUpperCase();

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/users/${userId}`}
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <AvatarPrimitive
            src={avatar}
            size={48}
            fallbackText={initial}
            fallbackClassName="bg-linear-to-br from-purple-500 to-pink-500"
            className="shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white inline-flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Boost Followers — {userName}
            </h1>
            <p className="text-xs text-gray-500">
              Real followers: <strong>{realFollowers.toLocaleString()}</strong>
              {displayBoost !== 0 && (
                <>
                  {" · "}Display boost:{" "}
                  <strong>
                    {displayBoost > 0 ? "+" : ""}
                    {displayBoost.toLocaleString()}
                  </strong>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Two-column layout — sticky preview on the right at lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-6">
        {/* ── Left: Audience filters ─────────────────────────────────── */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white inline-flex items-center gap-2">
              <Filter className="w-4 h-4 text-indigo-400" />
              Audience filters
              {filterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                  {filterCount} active
                </span>
              )}
            </h2>
            {filterCount > 0 && (
              <button
                onClick={() => setFilter(EMPTY_FILTER)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-white"
              >
                <Slash className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DropdownField
              label="Country"
              icon={<Globe className="w-3.5 h-3.5" />}
              value={filter.country}
              onChange={(v) => setFilter({ ...filter, country: v })}
              options={
                options?.countries.map((c) => ({
                  value: c.value,
                  label: c.value,
                  count: c.count,
                })) ?? []
              }
              loading={optionsLoading}
            />

            <DropdownField
              label="City"
              icon={<MapPin className="w-3.5 h-3.5" />}
              value={filter.city}
              onChange={(v) => setFilter({ ...filter, city: v })}
              options={
                options?.cities.map((c) => ({
                  value: c.value,
                  label: c.value,
                  count: c.count,
                })) ?? []
              }
              loading={optionsLoading}
            />

            <DropdownField
              label="Gender"
              icon={<UserCheck className="w-3.5 h-3.5" />}
              value={filter.gender}
              onChange={(v) => setFilter({ ...filter, gender: v })}
              options={[
                {
                  value: "Male",
                  label: "Male",
                  count: options?.genderCounts.male ?? 0,
                },
                {
                  value: "Female",
                  label: "Female",
                  count: options?.genderCounts.female ?? 0,
                },
                {
                  value: "Other",
                  label: "Other",
                  count: options?.genderCounts.other ?? 0,
                },
              ]}
              loading={optionsLoading}
            />

            <DropdownField
              label="Package tier"
              icon={<Crown className="w-3.5 h-3.5" />}
              value={filter.packageTier}
              onChange={(v) => setFilter({ ...filter, packageTier: v })}
              options={PACKAGE_TIERS.map((t) => ({
                value: t,
                label: t,
                count: options?.packageTierCounts[t] ?? 0,
              }))}
              loading={optionsLoading}
            />

            <DropdownField
              label="Blue verified"
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              value={filter.isBlueVerified}
              onChange={(v) =>
                setFilter({
                  ...filter,
                  isBlueVerified: v as FilterState["isBlueVerified"],
                })
              }
              options={[
                {
                  value: "yes",
                  label: "Verified only",
                  count: options?.blueVerifiedCounts.yes ?? 0,
                },
                {
                  value: "no",
                  label: "Unverified only",
                  count: options?.blueVerifiedCounts.no ?? 0,
                },
              ]}
              loading={optionsLoading}
            />

            <RangeField
              label="Age range"
              icon={<Cake className="w-3.5 h-3.5" />}
              minValue={filter.ageMin}
              maxValue={filter.ageMax}
              onMinChange={(v) => setFilter({ ...filter, ageMin: v })}
              onMaxChange={(v) => setFilter({ ...filter, ageMax: v })}
              min={1}
              max={120}
              hint="years"
            />

            <RangeField
              label="Level range"
              icon={<Award className="w-3.5 h-3.5" />}
              minValue={filter.levelMin}
              maxValue={filter.levelMax}
              onMinChange={(v) => setFilter({ ...filter, levelMin: v })}
              onMaxChange={(v) => setFilter({ ...filter, levelMax: v })}
              min={1}
              max={100}
              hint="Lv"
            />

            <label className="flex items-start gap-2 p-3 rounded-lg bg-gray-950 border border-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={filter.excludeAdmins}
                onChange={(e) =>
                  setFilter({ ...filter, excludeAdmins: e.target.checked })
                }
                className="mt-0.5 rounded bg-gray-800 border-gray-600 text-indigo-500"
              />
              <div className="flex-1">
                <p className="text-sm font-bold text-white">
                  Exclude admin / staff
                </p>
                <p className="text-[11px] text-gray-500">
                  Skip non-USER roles. Recommended.
                </p>
              </div>
            </label>
          </div>

          {options && (
            <p className="text-[11px] text-gray-500 inline-flex items-center gap-1.5">
              <Users className="w-3 h-3" />
              {options.totalActiveUsers.toLocaleString()} active users in pool
            </p>
          )}
        </div>

        {/* ── Right: Sticky preview + apply ─────────────────────────── */}
        <div className="lg:sticky lg:top-4 lg:self-start space-y-4">
          <div
            className={cn(
              "bg-gray-900 rounded-xl border p-5 space-y-4 transition-colors",
              appliedFlash
                ? "border-emerald-500/40"
                : "border-gray-800"
            )}
          >
            {appliedFlash ? (
              <div className="text-center py-6 space-y-1">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <p className="text-2xl font-bold text-white tabular-nums">
                  +{appliedFlash.count.toLocaleString()}
                </p>
                <p className="text-xs text-emerald-300">followers added</p>
              </div>
            ) : !hasFilter ? (
              <NoFilterPlaceholder
                totalActiveUsers={options?.totalActiveUsers ?? 0}
              />
            ) : (
              <>
                {/* Headline count */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    Audience size
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-white tabular-nums">
                      {previewing ? (
                        <Loader2 className="w-6 h-6 animate-spin text-gray-500 inline" />
                      ) : (
                        matchingCount.toLocaleString()
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      user{matchingCount === 1 ? "" : "s"} match
                    </p>
                  </div>
                  {overCap && !previewing && (
                    <p className="text-[11px] text-amber-400 mt-1">
                      Up to {cap.toLocaleString()} can be added per run.
                      Rerun with a tighter filter for more.
                    </p>
                  )}
                </div>

                {/* Sample table */}
                {preview && preview.sample.length > 0 && (
                  <SampleTable
                    sample={preview.sample}
                    matchingCount={matchingCount}
                  />
                )}

                {/* Amount input */}
                <div className="space-y-2 pt-2 border-t border-gray-800">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      How many to add?
                    </label>
                    {maxAddable > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAmount(String(maxAddable));
                          setAmountTouched(true);
                        }}
                        className="text-[11px] text-purple-400 hover:text-purple-300 inline-flex items-center gap-0.5"
                      >
                        Use all {maxAddable.toLocaleString()}
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={maxAddable || undefined}
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setAmountTouched(true);
                    }}
                    placeholder={
                      maxAddable > 0
                        ? `1 – ${maxAddable.toLocaleString()}`
                        : "No matches"
                    }
                    disabled={maxAddable === 0}
                    className={cn(
                      "w-full px-3 py-2 bg-gray-950 border rounded-lg text-base font-bold text-white placeholder-gray-600 focus:outline-none tabular-nums disabled:opacity-50",
                      amountTooHigh
                        ? "border-amber-500 focus:border-amber-500"
                        : "border-gray-700 focus:border-purple-500"
                    )}
                  />
                  {amountTooHigh && (
                    <p className="text-[11px] text-amber-400">
                      Limited to {maxAddable.toLocaleString()} this run.
                    </p>
                  )}
                  <p className="text-[10px] text-gray-500">
                    Selection is randomized from the matching pool.
                  </p>
                </div>

                {/* Notify */}
                <label className="flex items-start gap-2 p-2 rounded-lg bg-gray-950 border border-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyTarget}
                    onChange={(e) => setNotifyTarget(e.target.checked)}
                    className="mt-0.5 rounded bg-gray-800 border-gray-600 text-purple-500"
                  />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-white inline-flex items-center gap-1.5">
                      <Bell className="w-3 h-3" />
                      Notify target user
                    </p>
                    <p className="text-[10px] text-gray-500">
                      Single combined notification. Source users never notified.
                    </p>
                  </div>
                </label>

                {/* Apply */}
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={validAmount === 0 || previewing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg disabled:opacity-50"
                >
                  <Users className="w-4 h-4" />
                  {validAmount === 0
                    ? "No matches"
                    : `Apply — add ${validAmount.toLocaleString()} follower${validAmount === 1 ? "" : "s"}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Batch history */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-white inline-flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-400" />
            Boost history
          </h2>
          {batches.length > 0 && (
            <p className="text-xs text-gray-500">
              <span className="text-white font-bold">{batchStats.total}</span>{" "}
              batch{batchStats.total === 1 ? "" : "es"} ·{" "}
              <span className="text-emerald-400 font-bold">
                +{batchStats.added.toLocaleString()}
              </span>{" "}
              followers added
              {batchStats.reverted > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-red-400 font-bold">
                    {batchStats.reverted}
                  </span>{" "}
                  reverted
                </>
              )}
            </p>
          )}
        </div>

        {loadingBatches && (
          <div className="text-center py-6 text-xs text-gray-500">Loading…</div>
        )}

        {!loadingBatches && batches.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 p-6 text-center text-xs text-gray-500">
            No boost operations yet. Apply your first one above.
          </div>
        )}

        {!loadingBatches && batches.length > 0 && (
          <div className="space-y-2">
            {batches.map((b) => (
              <BatchRow
                key={b.id}
                batch={b}
                reverting={revertingId === b.id}
                onRevert={() => revertBatch(b)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md mx-4">
            <div className="p-5 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white inline-flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-purple-400" />
                Confirm boost
              </h2>
            </div>
            <div className="p-5 space-y-2 text-sm text-gray-200">
              <p>
                Add <strong>{validAmount.toLocaleString()}</strong> randomly
                selected users as followers of <strong>{userName}</strong>?
              </p>
              <p className="text-xs text-gray-400">
                Real Follow rows will be created. Reversible from the batch
                history below.
              </p>
              <p className="text-xs text-gray-400">
                Target notification: {notifyTarget ? "ON" : "OFF (silent)"}.
              </p>
            </div>
            <div className="flex gap-2 p-5 border-t border-gray-800">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={applying}
                className="flex-1 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={apply}
                disabled={applying}
                className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {applying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

interface DropdownOption {
  value: string;
  label: string;
  count: number;
}

function DropdownField({
  label,
  icon,
  value,
  onChange,
  options,
  loading,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  loading?: boolean;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">
        {icon}
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
      >
        <option value="">{loading ? "Loading…" : "Any"}</option>
        {options
          .filter((o) => o.count > 0 || value === o.value)
          .map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({o.count.toLocaleString()})
            </option>
          ))}
      </select>
    </div>
  );
}

function RangeField({
  label,
  icon,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  min,
  max,
  hint,
}: {
  label: string;
  icon?: React.ReactNode;
  minValue: string;
  maxValue: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">
        {icon}
        {label}
        {hint && <span className="text-gray-600 font-normal">· {hint}</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={minValue}
          onChange={(e) => onMinChange(e.target.value)}
          placeholder="min"
          className="flex-1 px-2 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 tabular-nums"
        />
        <span className="text-gray-500">–</span>
        <input
          type="number"
          min={min}
          max={max}
          value={maxValue}
          onChange={(e) => onMaxChange(e.target.value)}
          placeholder="max"
          className="flex-1 px-2 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 tabular-nums"
        />
      </div>
    </div>
  );
}

function NoFilterPlaceholder({
  totalActiveUsers,
}: {
  totalActiveUsers: number;
}) {
  return (
    <div className="text-center py-8 space-y-2">
      <div className="w-12 h-12 mx-auto rounded-full bg-gray-800 flex items-center justify-center">
        <Filter className="w-5 h-5 text-gray-500" />
      </div>
      <p className="text-sm font-bold text-white">Set a filter to begin</p>
      <p className="text-[11px] text-gray-500 max-w-xs mx-auto">
        Pick at least one filter on the left to define the audience. We won&apos;t
        show or add followers from the full pool.
      </p>
      {totalActiveUsers > 0 && (
        <p className="text-[10px] text-gray-600 mt-2">
          {totalActiveUsers.toLocaleString()} active users available
        </p>
      )}
    </div>
  );
}

function SampleTable({
  sample,
  matchingCount,
}: {
  sample: SampleUser[];
  matchingCount: number;
}) {
  // Always cap visual sample at 10. matchingCount may be much larger; the
  // header makes that explicit.
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
        {matchingCount > sample.length ? (
          <>
            Showing {sample.length} example{sample.length === 1 ? "" : "s"} of{" "}
            {matchingCount.toLocaleString()} matches
          </>
        ) : (
          <>
            Sample · {sample.length} match{sample.length === 1 ? "" : "es"}
          </>
        )}
      </p>
      <AdminTableShell className="rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-900 text-gray-500">
            <tr>
              <th className="text-left font-bold px-2 py-1.5">User</th>
              <th className="text-left font-bold px-2 py-1.5">Place</th>
              <th className="text-left font-bold px-2 py-1.5">Tier</th>
              <th className="text-right font-bold px-2 py-1.5">Lv</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sample.map((u) => (
              <tr key={u.id}>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Avatar src={u.avatar} fallback={u.name ?? u.username} />
                    <span className="text-white truncate max-w-32">
                      {u.name ?? u.username ?? "User"}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-gray-400">
                  <span className="truncate inline-block max-w-28">
                    {[u.country, u.city].filter(Boolean).join(" · ") || "—"}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <span className="text-[10px] font-bold text-gray-300">
                    {u.packageTier}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right text-gray-400 tabular-nums">
                  {u.level}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </div>
  );
}

function Avatar({
  src,
  fallback,
}: {
  src: string | null;
  fallback: string | null;
}) {
  const initial = (fallback ?? "U").charAt(0).toUpperCase();
  return (
    <AvatarPrimitive
      src={src}
      size={20}
      fallbackText={initial}
      className="shrink-0"
    />
  );
}

function BatchRow({
  batch,
  reverting,
  onRevert,
}: {
  batch: BoostBatch;
  reverting: boolean;
  onRevert: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 flex items-start gap-3 flex-wrap",
        batch.status === "REVERTED"
          ? "border-gray-800 bg-gray-950 opacity-60"
          : "border-gray-800 bg-gray-950"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-white tabular-nums">
            +{batch.addedCount.toLocaleString()} followers
          </span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
              batch.status === "APPLIED"
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-gray-700 text-gray-400"
            )}
          >
            {batch.status}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 text-[10px] font-bold uppercase">
            {batch.mode}
          </span>
          {batch.notifyTarget && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 text-[10px] font-bold uppercase">
              <Bell className="w-2.5 h-2.5" />
              Notified
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {format(new Date(batch.createdAt), "PP p")}
          {batch.revertedAt && (
            <> · reverted {format(new Date(batch.revertedAt), "PP p")}</>
          )}
        </p>
        <p className="text-[11px] text-gray-400 mt-1 font-mono break-all">
          {Object.entries(batch.criteria)
            .filter(
              ([k, v]) => k !== "excludeAdmins" && v !== "" && v != null
            )
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(" · ") || "No filter"}
        </p>
      </div>
      {batch.status === "APPLIED" && batch.addedCount > 0 && (
        <button
          onClick={onRevert}
          disabled={reverting}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-bold rounded-lg disabled:opacity-50"
        >
          {reverting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Undo2 className="w-3.5 h-3.5" />
          )}
          Revert
        </button>
      )}
    </div>
  );
}
