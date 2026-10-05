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
                onClick={() => setSelected(u.id)}
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
        <StaffPanel key={selected} row={staff.find((u) => u.id === selected)!} />
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

function StaffPanel({ row }: { row: StaffRow }) {
  const [b, setB] = useState<Breakdown | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/control-center/staff/${row.id}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error("Could not load", { description: d.error ?? "Try again" });
      return;
    }
    setB(d as Breakdown);
  }, [row.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const financeByRole = row.role === "FINANCE_ADMIN";

  /** Write the per-user override for a non-finance permission. */
  const setOverride = async (perm: Permission, state: State) => {
    if (!b) return;
    const next = { ...b.overrides };
    if (state === "default") delete next[perm];
    else next[perm] = state === "allow";
    setBusy(perm);
    try {
      const r = await fetch(`/api/admin/users/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionOverrides: Object.keys(next).length ? next : null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Try again");
      await load();
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setBusy(null);
    }
  };

  /** Finance permissions only come from the person's finance grants. */
  const setFinance = async (perm: Permission, on: boolean) => {
    if (!b) return;
    // The old "all balances" grant is split into points + cash, so turning
    // one of them off does not silently keep it through the shorthand.
    let grants = b.financeGrants.filter((g) => g !== "users.adjust_balance");
    if (b.financeGrants.includes("users.adjust_balance")) {
      grants.push("users.adjust_points", "users.adjust_cash");
    }
    grants = on ? [...new Set([...grants, perm])] : grants.filter((g) => g !== perm);
    setBusy(perm);
    try {
      const r = await fetch("/api/admin/company-finance/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grants", userId: row.id, grants }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Try again");
      await load();
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setBusy(null);
    }
  };

  if (!b) {
    return (
      <div className="grid place-items-center rounded-xl border border-slate-800 bg-slate-900/60 p-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const eff = new Set<string>(b.effective);
  const base = new Set<string>(b.base);
  const stateOf = (p: Permission): State =>
    b.overrides[p] === true ? "allow" : b.overrides[p] === false ? "block" : "default";

  const toggleAdjust = (p: Permission) => {
    const on = !eff.has(p);
    if (FINANCE.has(p)) return setFinance(p, on);
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
            {eff.size} permissions
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
          Points and cash are money: only granted by name. XP, level and followers follow the role unless you
          change them here.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {ADJUST.map(({ perm, label, icon: Icon, tone }) => {
            const on = eff.has(perm);
            const locked = FINANCE.has(perm) && financeByRole;
            return (
              <button
                key={perm}
                type="button"
                disabled={!!busy || locked}
                onClick={() => toggleAdjust(perm)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed",
                  on ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-700 bg-slate-950/60 hover:border-slate-500"
                )}
                title={locked ? "Finance admins always have this — change their role to remove it" : undefined}
              >
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tone)}>
                  {busy === perm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
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
                      <li key={p} className="flex flex-wrap items-center gap-3 px-3 py-2">
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
                        {busy === p && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                        {isFinance ? (
                          financeByRole ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <Lock className="h-3 w-3" /> Role
                            </span>
                          ) : (
                            <Segmented
                              value={on ? "allow" : "block"}
                              options={[
                                ["block", "Off"],
                                ["allow", "On"],
                              ]}
                              disabled={!!busy}
                              onChange={(v) => setFinance(p, v === "allow")}
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
                            disabled={!!busy}
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

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm font-bold text-white">Admin pages</p>
        <p className="mb-3 text-[11px] text-slate-400">Show or hide individual admin pages for this admin.</p>
        <AdminModuleOverridesPanel userId={row.id} />
      </div>
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
