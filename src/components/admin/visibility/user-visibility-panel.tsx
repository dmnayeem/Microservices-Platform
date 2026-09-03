"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Eye,
  EyeOff,
  Loader2,
  Search,
  RotateCcw,
  X,
  UserCog,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { USER_PAGES } from "@/lib/page-visibility";
import { FEATURES, type PackageFeatureKey } from "@/lib/features";

/**
 * Page + feature visibility for ONE named user.
 *
 * The package and role tabs answer "what does this class of people see". This
 * one answers "what does *this person* see", which is the question an admin
 * actually arrives with — usually about a single account that needs one page
 * opened or one capability taken away.
 *
 * Three states per row, not two: inherit (whatever package/role already say),
 * force show, force hide. A plain checkbox cannot express "leave this alone",
 * and without that the first save would freeze every page at its current value
 * — so later changes to the role rules would silently stop reaching this user.
 */

type Tri = "inherit" | "show" | "hide";

interface UserLite {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  avatar: string | null;
  role: string | null;
}

interface VisibilityState {
  user: UserLite;
  packageSlug: string | null;
  packageName: string | null;
  inheritedHidden: string[];
  pageOverrides: Record<string, boolean>;
  inheritedFeatures: Record<string, boolean>;
  featureOverrides: Record<string, boolean>;
}

export function UserVisibilityPanel() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [state, setState] = useState<VisibilityState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pageOv, setPageOv] = useState<Record<string, boolean>>({});
  const [featOv, setFeatOv] = useState<Record<string, boolean>>({});

  // Debounced search. All state writes happen inside the timer so a keystroke
  // never triggers a fetch that a later keystroke has already made stale.
  const qRef = useRef(q);
  qRef.current = q;
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      const t = setTimeout(() => setResults([]), 0);
      return () => clearTimeout(t);
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/users/search?q=${encodeURIComponent(term)}`
        );
        const data = await res.json();
        if (qRef.current.trim() === term) setResults(data.users ?? []);
      } catch {
        /* a failed lookup just shows nothing */
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/visibility`);
      if (!res.ok) throw new Error();
      const data: VisibilityState = await res.json();
      setState(data);
      setPageOv(data.pageOverrides ?? {});
      setFeatOv(data.featureOverrides ?? {});
      setDirty(false);
      setResults([]);
      setQ("");
    } catch {
      toast.error("Couldn't load this user's visibility");
    } finally {
      setLoading(false);
    }
  }, []);

  const save = async () => {
    if (!state) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${state.user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageOverrides: pageOv,
          featureOverrides: featOv,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Saved for ${state.user.name || state.user.email}`);
      setDirty(false);
      // Re-read: the inherited half may itself have moved, and the admin should
      // be looking at what is true now rather than what was true on open.
      await load(state.user.id);
    } catch {
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const pageTri = (path: string): Tri => {
    const v = pageOv[path];
    return v === undefined ? "inherit" : v ? "show" : "hide";
  };
  const setPageTri = (path: string, tri: Tri) => {
    setPageOv((prev) => {
      const next = { ...prev };
      if (tri === "inherit") delete next[path];
      else next[path] = tri === "show";
      return next;
    });
    setDirty(true);
  };

  const featTri = (key: string): Tri => {
    const v = featOv[key];
    return v === undefined ? "inherit" : v ? "show" : "hide";
  };
  const setFeatTri = (key: string, tri: Tri) => {
    setFeatOv((prev) => {
      const next = { ...prev };
      if (tri === "inherit") delete next[key];
      else next[key] = tri === "show";
      return next;
    });
    setDirty(true);
  };

  const clearAll = () => {
    setPageOv({});
    setFeatOv({});
    setDirty(true);
  };

  const overrideCount =
    Object.keys(pageOv).length + Object.keys(featOv).length;

  return (
    <div className="space-y-4">
      {/* Picker */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Find a user
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, email or username…"
            className="w-full pl-9 pr-9 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />
          )}
        </div>

        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-800 rounded-lg border border-slate-800 overflow-hidden">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => load(u.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-900"
                >
                  {u.avatar ? (
                    <Image
                      src={u.avatar}
                      alt=""
                      width={28}
                      height={28}
                      className="w-7 h-7 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-slate-800 grid place-items-center text-[10px] text-slate-400">
                      {(u.name || u.email || "?").slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm text-white truncate">
                      {u.name || u.username || "Unnamed"}
                    </span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      {u.email}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading && (
        <p className="text-sm text-slate-500 inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </p>
      )}

      {state && !loading && (
        <>
          {/* Who we are editing */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <UserCog className="w-5 h-5 text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-white font-semibold truncate">
                  {state.user.name || state.user.username || state.user.email}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {state.user.role} · plan: {state.packageName ?? "none"} ·{" "}
                  {overrideCount === 0
                    ? "no personal overrides"
                    : `${overrideCount} personal override${overrideCount === 1 ? "" : "s"}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearAll}
                disabled={overrideCount === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold disabled:opacity-40"
                title="Drop every personal override and go back to what the plan and role say"
              >
                <RotateCcw className="w-4 h-4" /> Reset to inherited
              </button>
              <button
                onClick={() => {
                  setState(null);
                  setDirty(false);
                }}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                {dirty ? "Save changes" : "Saved"}
              </button>
            </div>
          </div>

          <TriTable
            title="Pages"
            caption="What appears in this person's navigation. “Inherit” follows the plan and role tabs; the other two win over them."
            rows={USER_PAGES.map((p) => ({
              key: p.path,
              label: p.label,
              sub: p.path,
              group: p.group,
              inherited: !state.inheritedHidden.includes(p.path),
            }))}
            valueOf={pageTri}
            onChange={setPageTri}
          />

          <TriTable
            title="Functions"
            caption="Capabilities rather than pages — what this person is allowed to do once they are on a page."
            rows={FEATURES.map((f) => ({
              key: f.key,
              label: f.label,
              sub: f.key,
              group:
                f.group === "section"
                  ? "Sections"
                  : f.group === "creator"
                    ? "Creator & monetization"
                    : "Task types",
              inherited: Boolean(
                state.inheritedFeatures[f.key as PackageFeatureKey]
              ),
            }))}
            valueOf={featTri}
            onChange={setFeatTri}
          />
        </>
      )}

      {!state && !loading && (
        <p className="text-sm text-slate-500">
          Search for a user above to open or close individual pages and
          functions for just that account.
        </p>
      )}
    </div>
  );
}

/* ── One three-state grid, used for both pages and functions ── */

interface TriRow {
  key: string;
  label: string;
  sub: string;
  group: string;
  /** What the plan + role already grant, before this user's overrides. */
  inherited: boolean;
}

function TriTable({
  title,
  caption,
  rows,
  valueOf,
  onChange,
}: {
  title: string;
  caption: string;
  rows: TriRow[];
  valueOf: (key: string) => Tri;
  onChange: (key: string, tri: Tri) => void;
}) {
  const groups: [string, TriRow[]][] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last[0] === r.group) last[1].push(r);
    else groups.push([r.group, [r]]);
  }

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800">
        <h2 className="text-white font-semibold">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{caption}</p>
      </div>
      <div className="divide-y divide-slate-800/60">
        {groups.map(([group, items]) => (
          <div key={group}>
            <p className="px-4 py-1.5 bg-slate-950/60 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {group}
            </p>
            {items.map((r) => {
              const tri = valueOf(r.key);
              // An override that says the same thing as the inherited value is
              // doing nothing today but will keep doing nothing if the rules
              // later change — worth flagging rather than leaving to be found.
              const redundant =
                (tri === "show" && r.inherited) ||
                (tri === "hide" && !r.inherited);
              return (
                <div
                  key={r.key}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-slate-900/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{r.label}</p>
                    <p className="text-[10px] text-slate-600 truncate">
                      {r.sub}
                      <span className="ml-2 text-slate-500">
                        inherited:{" "}
                        {r.inherited ? (
                          <span className="text-emerald-500/80">visible</span>
                        ) : (
                          <span className="text-rose-500/80">hidden</span>
                        )}
                      </span>
                      {redundant && (
                        <span className="ml-2 text-amber-500/80">
                          same as inherited
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 rounded-lg overflow-hidden border border-slate-800">
                    {(
                      [
                        { v: "hide" as Tri, label: "Hide", icon: EyeOff },
                        { v: "inherit" as Tri, label: "Inherit", icon: null },
                        { v: "show" as Tri, label: "Show", icon: Eye },
                      ]
                    ).map(({ v, label, icon: Icon }) => (
                      <button
                        key={v}
                        onClick={() => onChange(r.key, v)}
                        className={`px-2.5 py-1.5 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                          tri === v
                            ? v === "hide"
                              ? "bg-rose-600 text-white"
                              : v === "show"
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-700 text-white"
                            : "bg-slate-950 text-slate-500 hover:text-white"
                        }`}
                      >
                        {Icon && <Icon className="w-3 h-3" />}
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
