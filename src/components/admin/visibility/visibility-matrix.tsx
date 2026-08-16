"use client";

import { Fragment, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Save, Layers, Shield } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  USER_PAGES,
  emptyPageRules,
  type PageVisibilityRules,
} from "@/lib/page-visibility";

// User-facing / mixed roles worth toggling page visibility for.
const ROLES: { key: string; label: string }[] = [
  { key: "USER", label: "User" },
  { key: "TUTOR", label: "Tutor" },
  { key: "AGENCY", label: "Agency" },
  { key: "AD_MANAGER", label: "Ad Manager" },
  { key: "MODERATOR", label: "Moderator" },
  { key: "SUPPORT_ADMIN", label: "Support Admin" },
  { key: "CONTENT_ADMIN", label: "Content Admin" },
  { key: "MARKETING_ADMIN", label: "Marketing Admin" },
  { key: "FINANCE_ADMIN", label: "Finance Admin" },
];

type Tab = "packages" | "roles";

interface Props {
  packages: { slug: string; name: string }[];
  initialRules: PageVisibilityRules;
}

export function VisibilityMatrix({ packages, initialRules }: Props) {
  const [tab, setTab] = useState<Tab>("packages");
  const [rules, setRules] = useState<PageVisibilityRules>(
    initialRules ?? emptyPageRules()
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const columns =
    tab === "packages"
      ? packages.map((p) => ({ key: p.slug, label: p.name }))
      : ROLES;

  const bucket = tab === "packages" ? rules.packages : rules.roles;

  // A page is HIDDEN for a column when its path is in that column's array.
  const isHidden = (colKey: string, path: string) =>
    (bucket[colKey] ?? []).includes(path);

  const toggle = (colKey: string, path: string) => {
    setRules((prev) => {
      const next: PageVisibilityRules = {
        packages: { ...prev.packages },
        roles: { ...prev.roles },
      };
      const b = tab === "packages" ? next.packages : next.roles;
      const cur = new Set(b[colKey] ?? []);
      if (cur.has(path)) cur.delete(path);
      else cur.add(path);
      if (cur.size === 0) delete b[colKey];
      else b[colKey] = Array.from(cur);
      return next;
    });
    setDirty(true);
  };

  // Hide/show an entire column at once.
  const setColumn = (colKey: string, hideAll: boolean) => {
    setRules((prev) => {
      const next: PageVisibilityRules = {
        packages: { ...prev.packages },
        roles: { ...prev.roles },
      };
      const b = tab === "packages" ? next.packages : next.roles;
      if (hideAll) b[colKey] = USER_PAGES.map((p) => p.path);
      else delete b[colKey];
      return next;
    });
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Eye className="w-6 h-6 text-indigo-400" /> Page Visibility
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Show or hide user-facing pages per package or per role. A checked box =
          visible; unchecked = hidden. Per-user overrides live on the user&apos;s
          edit screen and win over these rules.
        </p>
      </div>

      {/* Tabs + Save */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <button
            onClick={() => setTab("packages")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${
              tab === "packages"
                ? "bg-indigo-500 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            <Layers className="w-4 h-4" /> By package
          </button>
          <button
            onClick={() => setTab("roles")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${
              tab === "roles"
                ? "bg-indigo-500 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            <Shield className="w-4 h-4" /> By role
          </button>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {dirty ? "Save changes" : "Saved"}
        </button>
      </div>

      {columns.length === 0 ? (
        <p className="text-sm text-slate-500">No {tab} to configure.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900">
                <th className="sticky left-0 z-10 bg-slate-900 text-left px-3 py-2 font-semibold text-slate-300 min-w-[180px]">
                  Page
                </th>
                {columns.map((c) => {
                  const allHidden =
                    (bucket[c.key]?.length ?? 0) === USER_PAGES.length;
                  return (
                    <th
                      key={c.key}
                      className="px-2 py-2 text-center font-semibold text-slate-300 whitespace-nowrap"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="max-w-[90px] truncate">{c.label}</span>
                        <button
                          onClick={() => setColumn(c.key, !allHidden)}
                          title={allHidden ? "Show all" : "Hide all"}
                          className="text-[10px] text-slate-500 hover:text-white inline-flex items-center gap-0.5"
                        >
                          {allHidden ? (
                            <>
                              <EyeOff className="w-3 h-3" /> all
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3" /> all
                            </>
                          )}
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
                    <td
                      colSpan={columns.length + 1}
                      className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"
                    >
                      {group}
                    </td>
                  </tr>
                  {pages.map((p) => (
                    <tr
                      key={p.path}
                      className="border-t border-slate-800/60 hover:bg-slate-900/40"
                    >
                      <td className="sticky left-0 z-10 bg-slate-950 px-3 py-2 text-white whitespace-nowrap">
                        {p.label}
                        <span className="block text-[10px] text-slate-600">
                          {p.path}
                        </span>
                      </td>
                      {columns.map((c) => {
                        const hidden = isHidden(c.key, p.path);
                        return (
                          <td key={c.key} className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={!hidden}
                              onChange={() => toggle(c.key, p.path)}
                              title={hidden ? "Hidden — click to show" : "Visible — click to hide"}
                              className="w-4 h-4 accent-indigo-500 cursor-pointer"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
