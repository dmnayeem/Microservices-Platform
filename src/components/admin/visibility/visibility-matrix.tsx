"use client";

import { Fragment, useMemo, useState } from "react";
import { useUrlTab } from "@/components/admin/ui/use-url-tab";
import { EyeOff, Loader2, Save, Info } from "lucide-react";
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

export function VisibilityMatrix({ packages, roles, initialRules }: Props) {
  const [rules, setRules] = useState<PageVisibilityRules>(
    initialRules ?? emptyPageRules()
  );
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

  const setColumn = (c: Column, hideAll: boolean) => {
    setRules((prev) =>
      withList(prev, c, hideAll ? USER_PAGES.map((p) => p.path) : [])
    );
    setDirty(true);
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
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {dirty ? "Save changes" : "Saved"}
        </button>
      </div>

      <div className="max-w-full overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-900">
              <th className="sticky left-0 z-20 bg-slate-900 text-left px-3 py-2 font-semibold text-slate-300 min-w-37.5">
                Page
              </th>
              {columns.map((c) => {
                const count = hiddenList(rules, c).length;
                const allHidden = count === USER_PAGES.length;
                return (
                  <th
                    key={`${c.bucket}:${c.key}`}
                    className={`px-2 py-2 text-center font-semibold whitespace-nowrap ${
                      c.bucket === "global" ? "bg-rose-500/10 text-rose-400" : "text-slate-300"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      {bucketHead(c.bucket) && (
                        <span className="text-[9px] uppercase tracking-wider text-slate-500">
                          {bucketHead(c.bucket)}
                        </span>
                      )}
                      <span className="max-w-24 truncate" title={c.label}>
                        {c.label}
                      </span>
                      <button
                        onClick={() => setColumn(c, !allHidden)}
                        title={allHidden ? "Unhide every page in this column" : "Hide every page in this column"}
                        className="text-[10px] text-slate-500 hover:text-white"
                      >
                        {allHidden ? "clear" : count > 0 ? `${count} hidden` : "hide all"}
                      </button>
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
                  <td colSpan={columns.length} />
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
