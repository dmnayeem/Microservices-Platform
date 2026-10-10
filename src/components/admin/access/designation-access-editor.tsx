"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, LayoutDashboard, RotateCcw, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { SaveChangesBar } from "@/components/admin/control-center/staff-access-manager";

/**
 * Access → By designation (owner, 2026-10-10): pick a designation (Manager,
 * Admin, Finance Admin, Moderator…, or a custom role) and see EVERYTHING it
 * gets on one screen — what it can do (money included) and which admin pages
 * it sees — with one Save. Everyone holding that designation follows it; a
 * single admin is adjusted on top in Control Center → Staff access.
 */

export interface DesignationRow {
  key: string;
  label: string;
  kind: "role" | "custom";
  staff: number;
  permissions: string[];
  hiddenPages: string[];
  /** Built-in starting point for "Reset to default" (built-in roles only). */
  defaults: string[] | null;
  /** Permissions this designation can never hold (not offered). */
  notOffered: string[];
}

interface PermGroup {
  label: string;
  permissions: { key: string; label: string; description: string; money: boolean }[];
}

interface PageRow {
  href: string;
  name: string;
  group: string;
  permissions: string[];
  offForAll: boolean;
}

export function DesignationAccessEditor({
  designations,
  groups,
  pages,
  canEdit,
}: {
  designations: DesignationRow[];
  groups: PermGroup[];
  pages: PageRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(designations[0]?.key ?? "");
  const cur = designations.find((d) => d.key === selected) ?? designations[0];
  const [perms, setPerms] = useState<Set<string>>(() => new Set(cur?.permissions ?? []));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(cur?.hiddenPages ?? []));
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  const notOffered = useMemo(() => new Set(cur?.notOffered ?? []), [cur]);

  const changes = useMemo(() => {
    if (!cur) return 0;
    const a = new Set(cur.permissions);
    const h = new Set(cur.hiddenPages);
    let n = 0;
    for (const p of perms) if (!a.has(p)) n++;
    for (const p of a) if (!perms.has(p)) n++;
    for (const x of hidden) if (!h.has(x)) n++;
    for (const x of h) if (!hidden.has(x)) n++;
    return n;
  }, [cur, perms, hidden]);

  useEffect(() => {
    if (changes === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes]);

  const pick = (key: string) => {
    if (key === selected) return;
    if (changes > 0 && !window.confirm("You have unsaved changes for this designation. Discard them?")) return;
    const d = designations.find((x) => x.key === key);
    setSelected(key);
    setPerms(new Set(d?.permissions ?? []));
    setHidden(new Set(d?.hiddenPages ?? []));
  };

  const discard = () => {
    setPerms(new Set(cur?.permissions ?? []));
    setHidden(new Set(cur?.hiddenPages ?? []));
  };

  const setMany = (keys: string[], on: boolean) =>
    setPerms((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (notOffered.has(k)) continue;
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const allPermKeys = groups.flatMap((g) => g.permissions.map((p) => p.key)).filter((k) => !notOffered.has(k));

  /** A page shows when it isn't hidden for the designation and one of its permissions is held. */
  const pageOpen = (p: PageRow) => p.permissions.some((x) => perms.has(x));
  const pageVisible = (p: PageRow) => !p.offForAll && !hidden.has(p.href) && pageOpen(p);
  const setPage = (p: PageRow, show: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (show) next.delete(p.href);
      else next.add(p.href);
      return next;
    });
    // Showing a page the designation has no permission for gives it the
    // page's permissions too — otherwise the page would stay closed.
    if (show && !pageOpen(p)) setMany(p.permissions, true);
  };
  const setPagesMany = (list: PageRow[], show: boolean) => {
    for (const p of list) if (!p.offForAll) setPage(p, show);
  };

  const save = async () => {
    if (!cur) return;
    const money = groups.flatMap((g) => g.permissions).filter((p) => p.money && perms.has(p.key));
    if (
      money.length > 0 &&
      money.some((p) => !cur.permissions.includes(p.key)) &&
      !window.confirm(
        `Everyone who is ${cur.label} (${cur.staff} now) will be able to: ${money
          .filter((p) => !cur.permissions.includes(p.key))
          .map((p) => p.label)
          .join(", ")}.\n\nSave?`
      )
    )
      return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/access/designation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: cur.key, permissions: [...perms], hiddenPages: [...hidden] }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Not saved");
      toast.success(`${cur.label} saved`, { description: `Applies to all ${cur.staff} ${cur.label} account(s) now.` });
      router.refresh();
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setSaving(false);
    }
  };

  // After a save the server sends the new saved state; take it.
  useEffect(() => {
    setPerms(new Set(cur?.permissions ?? []));
    setHidden(new Set(cur?.hiddenPages ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designations]);

  if (!cur) return <p className="text-sm text-slate-400">No staff designations.</p>;

  const needle = q.trim().toLowerCase();
  const pageGroups = (() => {
    const m = new Map<string, PageRow[]>();
    for (const p of pages) {
      if (needle && !`${p.name} ${p.href}`.toLowerCase().includes(needle)) continue;
      m.set(p.group, [...(m.get(p.group) ?? []), p]);
    }
    return [...m.entries()];
  })();
  const shownGroups = groups
    .map((g) => ({
      ...g,
      permissions: g.permissions.filter(
        (p) =>
          !notOffered.has(p.key) &&
          (!needle || `${p.key} ${p.label} ${p.description} ${g.label}`.toLowerCase().includes(needle))
      ),
    }))
    .filter((g) => g.permissions.length > 0);
  const visibleCount = pages.filter(pageVisible).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Designations */}
      <div className="h-fit rounded-xl border border-slate-800 bg-slate-900/60 p-2 lg:sticky lg:top-4">
        <p className="px-2 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Designations</p>
        <ul className="space-y-1">
          {designations.map((d) => (
            <li key={d.key}>
              <button
                type="button"
                onClick={() => pick(d.key)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left transition-colors",
                  d.key === selected ? "bg-blue-500/15 ring-1 ring-blue-500/40" : "hover:bg-slate-800/60"
                )}
              >
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                  {d.label}
                  {d.kind === "custom" && (
                    <span className="rounded bg-violet-500/15 px-1 py-0.5 text-[9px] font-bold uppercase text-violet-300">custom</span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500">
                  {d.staff} staff · {d.permissions.length} permissions
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-500/15 text-blue-300">
            <BadgeCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-white">{cur.label}</p>
            <p className="text-xs text-slate-400">
              <Users className="mr-1 inline h-3.5 w-3.5" />
              {cur.staff} staff have this designation. Anyone given it later gets exactly this. To change one person
              only, use Control Center → Staff access.
            </p>
          </div>
          {canEdit && cur.defaults && (
            <button
              type="button"
              onClick={() => {
                setPerms(new Set(cur.defaults ?? []));
                setHidden(new Set());
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </button>
          )}
        </div>

        <label className="relative block max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a permission or page…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
          />
        </label>

        <div className="grid gap-4 2xl:grid-cols-2">
          {/* What they can do */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <p className="flex-1 text-sm font-bold text-white">
                What they can do <span className="font-normal text-slate-500">· {perms.size} on</span>
              </p>
              {canEdit && (
                <>
                  <button type="button" onClick={() => setMany(allPermKeys, true)} className="rounded border border-emerald-500/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/10">
                    Select all
                  </button>
                  <button type="button" onClick={() => setMany(allPermKeys, false)} className="rounded border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800">
                    Clear all
                  </button>
                </>
              )}
            </div>
            <div className="space-y-3">
              {shownGroups.map((g) => {
                const keys = g.permissions.map((p) => p.key);
                const on = keys.filter((k) => perms.has(k)).length;
                return (
                  <div key={g.label} className="rounded-lg border border-slate-800">
                    <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5">
                      <p className="flex-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {g.label} <span className="font-normal normal-case text-slate-500">· {on}/{keys.length}</span>
                      </p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setMany(keys, on !== keys.length)}
                          className="text-[11px] font-semibold text-sky-400 hover:underline"
                        >
                          {on === keys.length ? "None" : "All"}
                        </button>
                      )}
                    </div>
                    <ul className="divide-y divide-slate-800/70">
                      {g.permissions.map((p) => {
                        const isOn = perms.has(p.key);
                        const changed = isOn !== cur.permissions.includes(p.key);
                        return (
                          <li key={p.key}>
                            <label className={cn("flex cursor-pointer items-start gap-3 px-3 py-2", changed && "bg-amber-500/10", !canEdit && "cursor-default")}>
                              <input
                                type="checkbox"
                                checked={isOn}
                                disabled={!canEdit}
                                onChange={(e) => setMany([p.key], e.target.checked)}
                                className="mt-0.5 h-4 w-4 accent-emerald-500"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm text-white">
                                  {p.label}
                                  {p.money && (
                                    <span className="ml-1.5 rounded bg-rose-500/15 px-1 py-0.5 text-[9px] font-bold uppercase text-rose-300">money</span>
                                  )}
                                  {changed && (
                                    <span className="ml-1.5 rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-200">unsaved</span>
                                  )}
                                </span>
                                {p.description && <span className="block text-[11px] text-slate-500">{p.description}</span>}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Admin pages */}
          <section className="h-fit rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-sky-400" />
              <p className="flex-1 text-sm font-bold text-white">
                Admin pages they see <span className="font-normal text-slate-500">· {visibleCount}</span>
              </p>
              {canEdit && (
                <>
                  <button type="button" onClick={() => setPagesMany(pages, true)} className="rounded border border-emerald-500/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/10">
                    Show all
                  </button>
                  <button type="button" onClick={() => setPagesMany(pages, false)} className="rounded border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800">
                    Hide all
                  </button>
                </>
              )}
            </div>
            <p className="mb-3 text-[11px] text-slate-500">
              Ticking a page they have no permission for also gives them that page&apos;s permissions. Unticking only
              hides the page — its permissions stay, because other pages may use them.
            </p>
            <div className="space-y-3">
              {pageGroups.map(([group, list]) => {
                const vis = list.filter(pageVisible).length;
                return (
                  <div key={group} className="rounded-lg border border-slate-800">
                    <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5">
                      <p className="flex-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {group} <span className="font-normal normal-case text-slate-500">· {vis}/{list.length}</span>
                      </p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setPagesMany(list, vis !== list.filter((p) => !p.offForAll).length)}
                          className="text-[11px] font-semibold text-sky-400 hover:underline"
                        >
                          {vis === list.filter((p) => !p.offForAll).length ? "None" : "All"}
                        </button>
                      )}
                    </div>
                    <ul className="divide-y divide-slate-800/70">
                      {list.map((p) => {
                        const vis1 = pageVisible(p);
                        const wasVisible =
                          !p.offForAll && !cur.hiddenPages.includes(p.href) && p.permissions.some((x) => cur.permissions.includes(x));
                        const changed = vis1 !== wasVisible;
                        return (
                          <li key={p.href}>
                            <label className={cn("flex items-center gap-3 px-3 py-2", changed && "bg-amber-500/10", canEdit && !p.offForAll && "cursor-pointer")}>
                              <input
                                type="checkbox"
                                checked={vis1}
                                disabled={!canEdit || p.offForAll}
                                onChange={(e) => setPage(p, e.target.checked)}
                                className="h-4 w-4 accent-sky-500"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-white">{p.name}</span>
                                <span className="block truncate text-[10px] text-slate-500">
                                  {p.href}
                                  {p.offForAll
                                    ? " · off for all admins (Admin pages tab)"
                                    : !pageOpen(p)
                                      ? " · no permission for it yet"
                                      : ""}
                                </span>
                              </span>
                              {changed && (
                                <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-200">unsaved</span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {canEdit && (
          <SaveChangesBar count={changes} saving={saving} onSave={save} onDiscard={discard} what={`for ${cur.label}`} />
        )}
      </div>
    </div>
  );
}
