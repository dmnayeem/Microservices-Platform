"use client";

import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { iconMap } from "@/components/admin/sidebar";
import { LayoutDashboard, Loader2, RotateCcw, Save, Search, Info, Link2 } from "lucide-react";

type ModuleRow = {
  href: string;
  name: string;
  icon: string;
  configurable: boolean;
  /** Why a row cannot be changed ("always on", "super admin only"). */
  lockedReason: string | null;
  /** Other pages holding one of this page's permissions. */
  sharesWith: string[];
};
type ModuleGroup = { label: string; modules: ModuleRow[] };
type RoleMeta = { role: string; label: string };
type Rules = { disabled: string[]; roles: Record<string, string[]> };

interface Props {
  groups: ModuleGroup[];
  roles: RoleMeta[];
  initial: Rules;
  /** Per role, the pages its permissions open at all (else the cell is moot). */
  roleReach: Record<string, string[]>;
  canManage: boolean;
}

const ALL = "__all__";

export function AdminPagesEditor({ groups, roles, initial, roleReach, canManage }: Props) {
  const toSets = (r: Rules) => {
    const out: Record<string, Set<string>> = { [ALL]: new Set(r.disabled) };
    for (const { role } of roles) out[role] = new Set(r.roles[role] ?? []);
    return out;
  };
  const [saved, setSaved] = useState(() => toSets(initial));
  const [hidden, setHidden] = useState(() => toSets(initial));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const reach = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const [r, hrefs] of Object.entries(roleReach)) out[r] = new Set(hrefs);
    return out;
  }, [roleReach]);

  const dirty = useMemo(
    () =>
      Object.keys(hidden).some((k) => {
        const a = hidden[k];
        const b = saved[k] ?? new Set<string>();
        return a.size !== b.size || [...a].some((h) => !b.has(h));
      }),
    [hidden, saved]
  );

  const toggle = (col: string, href: string) => {
    if (!canManage) return;
    setHidden((prev) => {
      const next = { ...prev, [col]: new Set(prev[col]) };
      if (next[col].has(href)) next[col].delete(href);
      else next[col].add(href);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const rules: Rules = { disabled: [...hidden[ALL]], roles: {} };
      for (const { role } of roles) {
        if (hidden[role]?.size) rules.roles[role] = [...hidden[role]];
      }
      const res = await fetch("/api/admin/access/module-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Save failed");
      const fresh = toSets(data.rules as Rules);
      setSaved(fresh);
      setHidden(fresh);
      toast.success("Admin pages saved");
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const needle = q.trim().toLowerCase();
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      modules: needle
        ? g.modules.filter(
            (m) => m.name.toLowerCase().includes(needle) || m.href.includes(needle)
          )
        : g.modules,
    }))
    .filter((g) => g.modules.length > 0);

  const cols = [{ role: ALL, label: "Off for all admins" }, ...roles];

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-white">Which admin pages exist, and for whom</h3>
        <p className="text-xs text-slate-400">
          A ticked box <b>hides</b> that page — from the sidebar and from its address. The
          super admin always sees everything. A single admin can be given or refused a page on
          their own account (Users → Edit → Permissions → Admin pages), and that wins over
          this table.
        </p>
        <p className="text-xs text-amber-300/90 flex gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Hiding is page-level. Some pages share a permission (marked{" "}
            <Link2 className="inline w-3 h-3" />) — hiding one does not take the permission
            away, so the other pages keep working. To remove an ability everywhere, change the
            role&apos;s permissions instead.
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a page"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-white placeholder:text-slate-500"
          />
        </div>
        {canManage && (
          <>
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => setHidden(saved)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 disabled:opacity-40"
            >
              <RotateCcw className="w-4 h-4" /> Undo
            </button>
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={save}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </>
        )}
      </div>
      {!canManage && (
        <p className="text-xs text-slate-500">Only a super admin can change this table.</p>
      )}

      {/* Scrolls on both axes inside a screen-high box so the role header
          stays pinned while the page list scrolls (with only overflow-x the
          box never scrolled vertically, so `sticky` had nothing to stick to). */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 max-h-[calc(100dvh-9rem)] overflow-auto overscroll-contain">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-slate-900 shadow-[inset_0_-1px_0_rgb(30_41_59)]">
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 min-w-[14rem]">
                Page
              </th>
              {cols.map((c) => (
                <th
                  key={c.role}
                  className={`px-2 py-3 text-[11px] font-semibold text-center whitespace-nowrap ${
                    c.role === ALL ? "text-red-300" : "text-slate-400"
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((g) => (
              <GroupRows
                key={g.label}
                group={g}
                cols={cols}
                hidden={hidden}
                reach={reach}
                canManage={canManage}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        A dash means that role&apos;s permissions don&apos;t open the page anyway, so there is
        nothing to hide.
      </p>
    </div>
  );
}

function GroupRows({
  group,
  cols,
  hidden,
  reach,
  canManage,
  onToggle,
}: {
  group: ModuleGroup;
  cols: Array<{ role: string; label: string }>;
  hidden: Record<string, Set<string>>;
  reach: Record<string, Set<string>>;
  canManage: boolean;
  onToggle: (col: string, href: string) => void;
}) {
  return (
    <>
      <tr className="bg-slate-950/60">
        <td
          colSpan={cols.length + 1}
          className="px-4 py-2 text-[11px] uppercase tracking-wider font-bold text-slate-500"
        >
          {group.label}
        </td>
      </tr>
      {group.modules.map((m) => {
        const Icon = iconMap[m.icon] || LayoutDashboard;
        const offForAll = hidden[ALL]?.has(m.href);
        return (
          <tr key={m.href} className="border-t border-slate-800/70 hover:bg-slate-800/30">
            <td className="px-4 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-slate-200 text-xs font-medium truncate">
                    {m.name}
                    {m.sharesWith.length > 0 && (
                      <span title={`Shares a permission with: ${m.sharesWith.join(", ")}`}>
                        <Link2 className="inline w-3 h-3 ml-1 text-amber-400/80" />
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono truncate">{m.href}</p>
                  {m.sharesWith.length > 0 && (
                    <p className="text-[10px] text-amber-300/70 leading-tight">
                      Shares a permission with {m.sharesWith.slice(0, 4).join(", ")}
                      {m.sharesWith.length > 4 ? ` +${m.sharesWith.length - 4}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </td>
            {cols.map((c) => {
              if (!m.configurable) {
                return (
                  <td key={c.role} className="px-2 py-2 text-center text-[10px] text-slate-500">
                    {c.role === ALL ? m.lockedReason : ""}
                  </td>
                );
              }
              const isAll = c.role === ALL;
              const moot = !isAll && !reach[c.role]?.has(m.href);
              const checked = hidden[c.role]?.has(m.href) ?? false;
              if (moot && !checked) {
                return (
                  <td key={c.role} className="px-2 py-2 text-center text-slate-500">
                    –
                  </td>
                );
              }
              return (
                <td key={c.role} className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Hide ${m.name} for ${c.label}`}
                    checked={checked}
                    disabled={!canManage || (!isAll && offForAll)}
                    title={!isAll && offForAll ? "Already off for all admins" : undefined}
                    onChange={() => onToggle(c.role, m.href)}
                    className={`h-4 w-4 rounded ${isAll ? "accent-red-500" : "accent-blue-500"} disabled:opacity-40`}
                  />
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
