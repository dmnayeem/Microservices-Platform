"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Coins,
  DollarSign,
  ExternalLink,
  Loader2,
  Lock,
  Search,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  FINANCE_PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_META,
  type Permission,
} from "@/lib/rbac";
import { AdminModuleOverridesPanel } from "@/components/admin/access/admin-module-overrides-panel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export interface StaffRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  customRole: string | null;
  granted: number;
  blocked: number;
  finance: number;
  pages: number;
}

interface Breakdown {
  role: string;
  base: Permission[];
  overrides: Record<string, boolean>;
  financeGrants: string[];
  /** Money the admin's designation gives (Access → By designation). */
  designationMoney?: string[];
  effective: Permission[];
}

const FINANCE = new Set<string>(FINANCE_PERMISSIONS);

/** The hand adjustments the owner asked to control one by one. */
const ADJUST: Array<{ perm: Permission; label: string; icon: typeof Coins; tone: string }> = [
  { perm: "users.adjust_points", label: "Points", icon: Coins, tone: "text-amber-300 bg-amber-500/15" },
  { perm: "users.adjust_cash", label: "Cash", icon: DollarSign, tone: "text-emerald-300 bg-emerald-500/15" },
  { perm: "users.adjust_xp", label: "XP", icon: Sparkles, tone: "text-violet-300 bg-violet-500/15" },
  { perm: "users.adjust_level", label: "Level", icon: TrendingUp, tone: "text-sky-300 bg-sky-500/15" },
  { perm: "users.adjust_followers", label: "Followers", icon: Users, tone: "text-pink-300 bg-pink-500/15" },
];

const ROLE_LABEL: Record<string, string> = {
  MANAGER: "Manager",
  ADMIN: "Admin",
  FINANCE_ADMIN: "Finance admin",
  FINANCE_MODERATOR: "Finance moderator",
  CONTENT_ADMIN: "Content admin",
  SUPPORT_ADMIN: "Support admin",
  MARKETING_ADMIN: "Marketing admin",
  MODERATOR: "Moderator",
  AD_MANAGER: "Ad manager",
};

export function StaffAccessManager({ staff }: { staff: StaffRow[] }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(staff[0]?.id ?? null);
  const [panelDirty, setPanelDirty] = useState(false);
  const pick = (id: string) => {
    if (id === selected) return;
    if (panelDirty && !window.confirm("You have unsaved changes for this admin. Discard them?")) return;
    setPanelDirty(false);
    setSelected(id);
  };
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? staff.filter((u) =>
          [u.name, u.email, u.role, u.customRole].some((v) => (v ?? "").toLowerCase().includes(s))
        )
      : staff;
  }, [q, staff]);

  if (staff.length === 0) {
    return (
      <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
        No other admins yet. Create one under Admin accounts.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find an admin"
            className="w-full rounded-lg bg-slate-950 py-2 pl-8 pr-2 text-sm text-white outline-none ring-1 ring-slate-800 focus:ring-slate-600"
          />
        </div>
        <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
          {shown.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => pick(u.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left transition-colors",
                  selected === u.id ? "bg-amber-500/10 ring-1 ring-amber-500/40" : "hover:bg-slate-800/60"
                )}
              >
                <p className="truncate text-sm font-semibold text-white">{u.name || u.email}</p>
                <p className="truncate text-[11px] text-slate-400">
                  {u.customRole ? `${u.customRole} (custom)` : ROLE_LABEL[u.role] ?? u.role}
                  {u.status !== "ACTIVE" ? ` · ${u.status.toLowerCase()}` : ""}
                </p>
                {(u.granted || u.blocked || u.finance || u.pages) > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1 text-[10px]">
                    {u.granted > 0 && <Chip tone="emerald">+{u.granted} allowed</Chip>}
                    {u.blocked > 0 && <Chip tone="rose">{u.blocked} blocked</Chip>}
                    {u.finance > 0 && <Chip tone="amber">{u.finance} finance</Chip>}
                    {u.pages > 0 && <Chip tone="sky">{u.pages} pages</Chip>}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected ? (
        <StaffPanel key={selected} row={staff.find((u) => u.id === selected)!} onDirtyChange={setPanelDirty} />
      ) : null}
    </div>
  );
}

function Chip({ tone, children }: { tone: "emerald" | "rose" | "amber" | "sky"; children: React.ReactNode }) {
  const t = {
    emerald: "bg-emerald-500/15 text-emerald-300",
    rose: "bg-rose-500/15 text-rose-300",
    amber: "bg-amber-500/15 text-amber-300",
    sky: "bg-sky-500/15 text-sky-300",
  }[tone];
  return <span className={cn("rounded px-1.5 py-0.5 font-semibold", t)}>{children}</span>;
}

type State = "default" | "allow" | "block";

/** Finance grants as one canonical list: the old "all balances" shorthand split into points + cash. */
function normGrants(g: string[]): string[] {
  const out = g.filter((x) => x !== "users.adjust_balance");
  if (g.includes("users.adjust_balance")) out.push("users.adjust_points", "users.adjust_cash");
  return [...new Set(out)].sort();
}

/**
 * One admin's access. Every click only changes the draft on screen; nothing is
 * written until "Save changes" — the owner asked for one Save, not a save per
 * click (2026-10-09).
 */
function StaffPanel({ row, onDirtyChange }: { row: StaffRow; onDirtyChange: (dirty: boolean) => void }) {
  const [b, setB] = useState<Breakdown | null>(null);
  const [draftOv, setDraftOv] = useState<Record<string, boolean>>({});
  const [draftFin, setDraftFin] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/control-center/staff/${row.id}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error("Could not load", { description: d.error ?? "Try again" });
      return;
    }
    const bd = d as Breakdown;
    setB(bd);
    setDraftOv({ ...bd.overrides });
    setDraftFin(normGrants(bd.financeGrants));
  }, [row.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const financeByRole = row.role === "FINANCE_ADMIN";

  const savedFin = useMemo(() => (b ? normGrants(b.financeGrants) : []), [b]);
  const changedOv = useMemo(() => {
    if (!b) return [] as string[];
    const keys = new Set([...Object.keys(b.overrides), ...Object.keys(draftOv)]);
    return [...keys].filter((k) => b.overrides[k] !== draftOv[k]);
  }, [b, draftOv]);
  const changedFin = useMemo(
    () => [...savedFin.filter((g) => !draftFin.includes(g)), ...draftFin.filter((g) => !savedFin.includes(g))],
    [savedFin, draftFin]
  );
  const changes = changedOv.length + changedFin.length;
  const dirty = changes > 0;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Leaving the page with unsaved access changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const discard = () => {
    if (!b) return;
    setDraftOv({ ...b.overrides });
    setDraftFin(savedFin);
  };

  const save = async () => {
    if (!b || !dirty) return;
    setSaving(true);
    try {
      if (changedOv.length > 0) {
        const r = await fetch(`/api/admin/users/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissionOverrides: Object.keys(draftOv).length ? draftOv : null }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Permissions were not saved");
      }
      if (changedFin.length > 0) {
        const r = await fetch("/api/admin/company-finance/team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "grants", userId: row.id, grants: draftFin }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Money permissions were not saved");
      }
      toast.success("Access saved", { description: `${changes} change${changes === 1 ? "" : "s"} for ${row.name || row.email}` });
      await load();
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : "Try again" });
      await load();
    } finally {
      setSaving(false);
    }
  };

  /** A per-user override for a non-finance permission (draft). */
  const setOverride = (perm: Permission, state: State) => {
    setDraftOv((prev) => {
      const next = { ...prev };
      if (state === "default") delete next[perm];
      else next[perm] = state === "allow";
      return next;
    });
  };

  /**
   * A money permission for this admin (draft). Default = whatever their
   * designation gives; Allow = granted to them by name; Block = taken away from
   * them even when the designation gives it.
   */
  const setMoney = (perm: Permission, state: State) => {
    setDraftFin((prev) =>
      (state === "allow" ? [...new Set([...prev, perm])] : prev.filter((g) => g !== perm)).sort()
    );
    setDraftOv((prev) => {
      const next = { ...prev };
      if (state === "block") next[perm] = false;
      else delete next[perm];
      return next;
    });
  };

  if (!b) {
    return (
      <div className="grid place-items-center rounded-xl border border-slate-800 bg-slate-900/60 p-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const savedEff = new Set<string>(b.effective);
  const base = new Set<string>(b.base);
  const changed = new Set<string>([...changedOv, ...changedFin]);
  // What this admin will have once saved. Unchanged rows show the server's
  // answer; changed rows show what the draft will give them.
  const has = (p: string): boolean => {
    if (!changed.has(p)) return savedEff.has(p);
    if (FINANCE.has(p)) return draftFin.includes(p) || (base.has(p) && draftOv[p] !== false);
    return draftOv[p] === true ? true : draftOv[p] === false ? false : base.has(p);
  };
  const eff = { has };
  const stateOf = (p: Permission): State =>
    FINANCE.has(p)
      ? draftFin.includes(p)
        ? "allow"
        : draftOv[p] === false
          ? "block"
          : "default"
      : draftOv[p] === true
        ? "allow"
        : draftOv[p] === false
          ? "block"
          : "default";

  const toggleAdjust = (p: Permission) => {
    const on = !eff.has(p);
    if (FINANCE.has(p)) return setMoney(p, on ? (base.has(p) ? "default" : "allow") : base.has(p) ? "block" : "default");
    // Back to the role default when that already matches; otherwise an explicit allow/block.
    return setOverride(p, on === base.has(p) ? "default" : on ? "allow" : "block");
  };

  const f = filter.trim().toLowerCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-white">{row.name || row.email}</p>
          <p className="truncate text-xs text-slate-400">
            {row.email} · {row.customRole ? `${row.customRole} (custom role)` : ROLE_LABEL[row.role] ?? row.role} ·{" "}
            {b.effective.length} permissions
          </p>
        </div>
        <Link
          href={`/admin/users/${row.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
        >
          Full profile <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* The five hand adjustments, one switch each. */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-sm font-bold text-white">Change users&apos; numbers by hand</p>
        <p className="mb-3 text-[11px] text-slate-400">
          Each follows this admin&apos;s designation (Access → By designation) unless you change it here for
          them alone.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {ADJUST.map(({ perm, label, icon: Icon, tone }) => {
            const on = eff.has(perm);
            const locked = FINANCE.has(perm) && financeByRole;
            return (
              <button
                key={perm}
                type="button"
                disabled={saving || locked}
                onClick={() => toggleAdjust(perm)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed",
                  on ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-700 bg-slate-950/60 hover:border-slate-500",
                  changed.has(perm) && "ring-2 ring-amber-400/60"
                )}
                title={locked ? "Finance admins always have this — change their role to remove it" : undefined}
              >
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tone)}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{label}</span>
                  <span className={cn("block text-[11px]", on ? "text-emerald-300" : "text-slate-500")}>
                    {locked ? "Always (role)" : on ? "Allowed" : "Not allowed"}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                    on ? "bg-emerald-500" : "bg-slate-700"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                      on ? "left-4.5" : "left-0.5"
                    )}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Every permission, grouped. */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-white">All permissions</p>
            <p className="text-[11px] text-slate-400">
              Default = what the role gives. Allow / Block = for this admin only.
            </p>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            className="w-40 rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none ring-1 ring-slate-800 focus:ring-slate-600"
          />
        </div>
        <div className="space-y-4">
          {PERMISSION_CATALOG.map((g) => {
            const perms = g.permissions.filter((p) => {
              // The "all balances" shorthand is not offered here: points,
              // cash, XP and level each have their own switch above, and
              // turning the shorthand off could not tell which of them to keep.
              if (p === "users.adjust_balance") return false;
              if (!f) return true;
              const m = PERMISSION_META[p];
              return `${p} ${m?.label ?? ""} ${m?.description ?? ""} ${g.label}`.toLowerCase().includes(f);
            });
            if (perms.length === 0) return null;
            return (
              <div key={g.label}>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300/80">
                  {g.label}
                </p>
                <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
                  {perms.map((p) => {
                    const m = PERMISSION_META[p];
                    const isFinance = FINANCE.has(p);
                    const on = eff.has(p);
                    return (
                      <li
                        key={p}
                        className={cn("flex flex-wrap items-center gap-3 px-3 py-2", changed.has(p) && "bg-amber-500/10")}
                      >
                        <span
                          className={cn("h-2 w-2 shrink-0 rounded-full", on ? "bg-emerald-400" : "bg-slate-600")}
                          title={on ? "Has it" : "Does not have it"}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-white">
                            {m?.label ?? p}
                            {isFinance && (
                              <span className="ml-1.5 rounded bg-rose-500/15 px-1 py-0.5 text-[9px] font-bold uppercase text-rose-300">
                                money
                              </span>
                            )}
                          </span>
                          {m?.description && <span className="block text-[11px] text-slate-500">{m.description}</span>}
                        </span>
                        {changed.has(p) && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-200">
                            unsaved
                          </span>
                        )}
                        {isFinance ? (
                          financeByRole ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <Lock className="h-3 w-3" /> Role
                            </span>
                          ) : (
                            <Segmented
                              value={stateOf(p)}
                              options={[
                                ["default", base.has(p) ? "Default (on)" : "Default (off)"],
                                ["allow", "Allow"],
                                ["block", "Block"],
                              ]}
                              disabled={saving}
                              onChange={(v) => setMoney(p, v as State)}
                            />
                          )
                        ) : (
                          <Segmented
                            value={stateOf(p)}
                            options={[
                              ["default", base.has(p) ? "Default (on)" : "Default (off)"],
                              ["allow", "Allow"],
                              ["block", "Block"],
                            ]}
                            disabled={saving}
                            onChange={(v) => setOverride(p, v as State)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <SaveChangesBar
        count={changes}
        saving={saving}
        onSave={save}
        onDiscard={discard}
        what={`for ${row.name || row.email}`}
      />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm font-bold text-white">Admin pages</p>
        <p className="mb-3 text-[11px] text-slate-400">Show or hide individual admin pages for this admin.</p>
        <AdminModuleOverridesPanel userId={row.id} />
      </div>
    </div>
  );
}

/** Sticky "N unsaved changes — Discard / Save changes" bar. Hidden when there is nothing to save. */
export function SaveChangesBar({
  count,
  saving,
  onSave,
  onDiscard,
  what,
  text,
}: {
  count: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  what?: string;
  /** Replaces "N unsaved changes" when the editor does not count them. */
  text?: string;
}) {
  if (count === 0 && !saving) return null;
  return (
    <div className="sticky bottom-3 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-slate-900/95 p-3 shadow-2xl backdrop-blur">
      <p className="min-w-0 flex-1 text-sm font-semibold text-amber-200">
        {text ?? `${count} unsaved change${count === 1 ? "" : "s"}`}
        {what ? <span className="font-normal text-slate-400"> {what}</span> : null}
      </p>
      <button
        type="button"
        onClick={onDiscard}
        disabled={saving}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
      >
        Discard
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save changes
      </button>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-700">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => v !== value && onChange(v)}
          className={cn(
            "px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed",
            v === value
              ? v === "block"
                ? "bg-rose-500/20 text-rose-200"
                : v === "allow"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-slate-700 text-white"
              : "bg-slate-950 text-slate-400 hover:text-white"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
