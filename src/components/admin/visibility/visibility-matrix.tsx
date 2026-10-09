"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useUrlTab } from "@/components/admin/ui/use-url-tab";
import { EyeOff, Loader2, Save, Info, RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  USER_PAGES,
  emptyPageRules,
  type PageVisibilityRules,
} from "@/lib/page-visibility";

/**
 * Pages × (Everyone + packages + roles) in ONE table. A checked box means the
 * page is HIDDEN for that column. Everyone/package/role union together — a
 * page hidden in any column a user falls into is hidden for them — and a
 * per-user "Show" (Per user tab) re-opens it for that one person.
 */

type Bucket = "global" | "packages" | "roles";
type View = "all" | Bucket;

interface Column {
  bucket: Bucket;
  key: string;
  label: string;
}

interface Props {
  packages: { slug: string; name: string }[];
  roles: { key: string; label: string }[];
  initialRules: PageVisibilityRules;
}

const GLOBAL_KEY = "*";

function hiddenList(rules: PageVisibilityRules, c: Column): string[] {
  if (c.bucket === "global") return rules.global;
  return rules[c.bucket][c.key] ?? [];
}

function withList(
  rules: PageVisibilityRules,
  c: Column,
  list: string[]
): PageVisibilityRules {
  const next: PageVisibilityRules = {
    global: [...rules.global],
    packages: { ...rules.packages },
    roles: { ...rules.roles },
  };
  if (c.bucket === "global") {
    next.global = list;
  } else {
    const b = next[c.bucket];
    if (list.length === 0) delete b[c.key];
    else b[c.key] = list;
  }
  return next;
}

/** A checkbox that can also show "some" (indeterminate). */
function TriCheck({
  state,
  onChange,
  label,
  className,
}: {
  state: "all" | "some" | "none";
  onChange: (hideAll: boolean) => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "all"}
      onChange={() => onChange(state !== "all")}
      aria-label={label}
      title={label}
      className={`w-4 h-4 cursor-pointer ${className ?? "accent-indigo-500"}`}
    />
  );
}

export function VisibilityMatrix({ packages, roles, initialRules }: Props) {
  const [rules, setRules] = useState<PageVisibilityRules>(
    initialRules ?? emptyPageRules()
  );
  // What is saved, so "Discard" can put the table back.
  const [savedRules, setSavedRules] = useState<PageVisibilityRules>(initialRules ?? emptyPageRules());
  // `?view=` — the page's own `?tab=` picks Pages vs the other tabs.
  const [view, setView] = useUrlTab<View>(
    "all",
    ["all", "global", "packages", "roles"],
    { param: "view" }
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const allColumns: Column[] = useMemo(
    () => [
      { bucket: "global", key: GLOBAL_KEY, label: "Everyone" },
      ...packages.map((p) => ({ bucket: "packages" as const, key: p.slug, label: p.name })),
      ...roles.map((r) => ({ bucket: "roles" as const, key: r.key, label: r.label })),
    ],
    [packages, roles]
  );
  const columns = view === "all" ? allColumns : allColumns.filter((c) => c.bucket === view);

  const isHidden = (c: Column, path: string) => hiddenList(rules, c).includes(path);

  const toggle = (c: Column, path: string) => {
    setRules((prev) => {
      const cur = new Set(hiddenList(prev, c));
      if (cur.has(path)) cur.delete(path);
      else cur.add(path);
      return withList(prev, c, Array.from(cur));
    });
    setDirty(true);
  };

  /** Hide or show a set of pages in a set of columns — the one bulk writer. */
  const setMany = (cols: Column[], paths: string[], hide: boolean) => {
    // Hiding pages from EVERYONE locks users out of them: ask first.
    if (hide && cols.some((c) => c.bucket === "global") && paths.length > 1) {
      if (!window.confirm(`Hide ${paths.length} pages from EVERY user? They disappear from the menus and open as "no access".`)) return;
    }
    setRules((prev) => {
      let next = prev;
      for (const c of cols) {
        const cur = new Set(hiddenList(next, c));
        for (const path of paths) {
          if (hide) cur.add(path);
          else cur.delete(path);
        }
        next = withList(next, c, Array.from(cur));
      }
      return next;
    });
    setDirty(true);
  };
  const ALL_PATHS = USER_PAGES.map((p) => p.path);
  const stateOf = (cols: Column[], paths: string[]): "all" | "some" | "none" => {
    let on = 0;
    for (const c of cols) for (const path of paths) if (isHidden(c, path)) on++;
    const total = cols.length * paths.length;
    return on === 0 ? "none" : on === total ? "all" : "some";
  };
  const setColumn = (c: Column, hideAll: boolean) => setMany([c], ALL_PATHS, hideAll);
  const discard = () => {
    setRules(savedRules);
    setDirty(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "visibility",
          settings: { "page_visibility.rules": rules },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Page visibility saved");
      setSavedRules(rules);
      setDirty(false);
    } catch {
      toast.error("Couldn't save visibility rules");
    } finally {
      setSaving(false);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, typeof USER_PAGES>();
    for (const p of USER_PAGES) {
      const arr = map.get(p.group) ?? [];
      arr.push(p);
      map.set(p.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  const bucketHead = (b: Bucket) =>
    b === "global" ? "" : b === "packages" ? "Package" : "Role";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
        <p>
          <b className="text-slate-200">Checked = hidden.</b> A page is hidden
          for a user when it is checked under <b>Everyone</b>, under their{" "}
          <b>package</b>, or under their <b>role</b>. A per-user setting (Per
          user tab) wins over all three — “Show” there re-opens a page even
          when it is hidden for everyone. Hidden pages drop out of the menus,
          redirect to “no access”, and their APIs refuse.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Columns">
          {(
            [
              { v: "all", label: "All columns" },
              { v: "global", label: "Everyone" },
              { v: "packages", label: "Packages" },
              { v: "roles", label: "Roles" },
            ] as { v: View; label: string }[]
          ).map((o) => (
            <button
              key={o.v}
              onClick={() => setView(o.v)}
              aria-pressed={view === o.v}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                view === o.v
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-800 text-slate-300 hover:text-white"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMany(columns, ALL_PATHS, true)}
            className="px-3 py-1.5 rounded-lg border border-rose-500/40 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
            title="Tick every box in the columns shown (hide every page for them)"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setMany(columns, ALL_PATHS, false)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            title="Untick every box in the columns shown (show every page)"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={discard}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Discard
          </button>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {dirty ? "Save changes" : "Saved"}
        </button>
        </div>
      </div>

      {/* Scrolls on both axes inside a screen-high box, so the column header
          stays pinned while the page list scrolls (sticky needs the scrolling
          box to be this one — overflow-x alone made it scroll with the page). */}
      <div className="max-h-[calc(100dvh-9rem)] max-w-full overflow-auto overscroll-contain rounded-xl border border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-900">
              <th className="sticky left-0 top-0 z-30 bg-slate-900 text-left px-3 py-2 font-semibold text-slate-300 min-w-37.5 shadow-[inset_0_-1px_0_rgb(30_41_59)]">
                Page
              </th>
              <th className="sticky top-0 z-20 bg-slate-900 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 shadow-[inset_0_-1px_0_rgb(30_41_59)]">
                <div className="flex flex-col items-center gap-1">
                  <span>All</span>
                  <TriCheck
                    state={stateOf(columns, ALL_PATHS)}
                    onChange={(hide) => setMany(columns, ALL_PATHS, hide)}
                    label="Hide or show every page in every column shown"
                  />
                </div>
              </th>
              {columns.map((c) => {
                const count = hiddenList(rules, c).length;
                const allHidden = count === USER_PAGES.length;
                return (
                  <th
                    key={`${c.bucket}:${c.key}`}
                    className={`sticky top-0 z-20 bg-slate-900 px-2 py-2 text-center font-semibold whitespace-nowrap shadow-[inset_0_-1px_0_rgb(30_41_59)] ${
                      c.bucket === "global" ? "text-rose-400" : "text-slate-300"
                    }`}
                  >
                    {/* Opaque base + tint: a see-through header would show the
                        rows scrolling underneath it. */}
                    {c.bucket === "global" && <span aria-hidden className="pointer-events-none absolute inset-0 bg-rose-500/10" />}
                    <div className="relative flex flex-col items-center gap-0.5">
                      {bucketHead(c.bucket) && (
                        <span className="text-[9px] uppercase tracking-wider text-slate-500">
                          {bucketHead(c.bucket)}
                        </span>
                      )}
                      <span className="max-w-24 truncate" title={c.label}>
                        {c.label}
                      </span>
                      <TriCheck
                        state={allHidden ? "all" : count > 0 ? "some" : "none"}
                        onChange={(hide) => setColumn(c, hide)}
                        label={allHidden ? `Show every page for ${c.label}` : `Hide every page for ${c.label}`}
                        className={c.bucket === "global" ? "accent-rose-500" : "accent-indigo-500"}
                      />
                      <span className="text-[10px] font-normal text-slate-500">
                        {count > 0 ? `${count} hidden` : "none hidden"}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, pages]) => (
              <Fragment key={group}>
                <tr className="bg-slate-950/60">
                  <td className="sticky left-0 z-10 bg-slate-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {group}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <TriCheck
                      state={stateOf(columns, pages.map((x) => x.path))}
                      onChange={(hide) => setMany(columns, pages.map((x) => x.path), hide)}
                      label={`Hide or show every ${group} page in every column shown`}
                    />
                  </td>
                  {columns.map((c) => (
                    <td key={`${c.bucket}:${c.key}`} className="px-2 py-1.5 text-center">
                      <TriCheck
                        state={stateOf([c], pages.map((x) => x.path))}
                        onChange={(hide) => setMany([c], pages.map((x) => x.path), hide)}
                        label={`Hide or show every ${group} page for ${c.label}`}
                        className={c.bucket === "global" ? "accent-rose-500" : "accent-indigo-500"}
                      />
                    </td>
                  ))}
                </tr>
                {pages.map((p) => {
                  const hiddenEverywhere = rules.global.includes(p.path);
                  return (
                    <tr key={p.path} className="border-t border-slate-800/60 hover:bg-slate-900/40">
                      <td className="sticky left-0 z-10 bg-slate-950 px-3 py-2 text-white whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {p.label}
                          {hiddenEverywhere && (
                            <EyeOff className="w-3 h-3 text-rose-400" aria-label="hidden for everyone" />
                          )}
                        </span>
                        <span className="block text-[10px] text-slate-600">{p.path}</span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <TriCheck
                          state={stateOf(columns, [p.path])}
                          onChange={(hide) => setMany(columns, [p.path], hide)}
                          label={`Hide or show ${p.label} in every column shown`}
                        />
                      </td>
                      {columns.map((c) => {
                        const hidden = isHidden(c, p.path);
                        // Under a global hide the other columns change nothing
                        // for this page — dim them so that is visible.
                        const moot = hiddenEverywhere && c.bucket !== "global";
                        return (
                          <td
                            key={`${c.bucket}:${c.key}`}
                            className={`px-2 py-2 text-center ${c.bucket === "global" ? "bg-rose-950/20" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={hidden}
                              onChange={() => toggle(c, p.path)}
                              aria-label={`Hide ${p.label} for ${c.label}`}
                              title={
                                moot
                                  ? "Already hidden for everyone"
                                  : hidden
                                    ? "Hidden — click to show"
                                    : "Visible — click to hide"
                              }
                              className={`w-4 h-4 cursor-pointer ${
                                c.bucket === "global" ? "accent-rose-500" : "accent-indigo-500"
                              } ${moot ? "opacity-30" : ""}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
