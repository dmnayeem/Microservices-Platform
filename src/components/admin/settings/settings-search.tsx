"use client";

/**
 * Find a setting without knowing which tab it lives on.
 *
 * There are 90-odd controls across nine tabs plus another dozen screens that
 * own settings of their own. An admin who remembers the word "withdrawal" was
 * previously expected to remember where it was filed — and when they could not
 * find it, the conclusion was that the setting did not exist.
 *
 * So this searches the name, the plain-language description, the raw key and
 * the tab/section it sits in, over `admin-settings-catalog.ts` — which covers
 * both the controls on this screen and the ones that live elsewhere in the
 * admin. Picking a result on this screen switches to its tab and scrolls the
 * control into view with a highlight; picking one that lives elsewhere links
 * out to it. "/" focuses the box from anywhere on the page; Enter opens the
 * top result.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X, ArrowRight, ExternalLink } from "lucide-react";
import { searchSettings, type SettingHit } from "@/lib/admin-settings-catalog";

export function SettingsSearch({
  onPick,
}: {
  /** Jump to a control on this screen (a hit with a `tab`). */
  onPick: (hit: SettingHit) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchSettings(q), [q]);
  const shown = hits.slice(0, 12);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))
        return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = (hit: SettingHit) => {
    if (hit.href) router.push(hit.href);
    else onPick(hit);
    setQ("");
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
      <label htmlFor="settings-search" className="mb-2 block text-xs font-semibold text-slate-300">
        Find a setting
        <span className="ml-2 font-normal text-slate-500">
          searches every setting, including the ones kept on other pages
        </span>
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          id="settings-search"
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) {
              e.preventDefault();
              open(shown[0]);
            } else if (e.key === "Escape") {
              setQ("");
            }
          }}
          placeholder="e.g. withdrawal fee, SMTP, maintenance, VAT…"
          aria-label="Search settings"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-16 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-700 px-1.5 text-[10px] text-slate-500 sm:block">
            /
          </kbd>
        )}
      </div>

      {q.trim() && (
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70">
          {shown.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">
              Nothing matches “{q}”. Settings that are not on this screen —
              referral rates, package rewards, course refunds — are indexed
              here too, so if it is not found it is most likely not a setting.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800/70">
              {shown.map((hit) => {
                const body = (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {hit.label}
                      </span>
                      {hit.status === "not-active" && (
                        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                          Not active yet
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-blue-300/80">
                      {hit.href ? "On another page: " : "In "}
                      {hit.where}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      {hit.description}
                    </p>
                  </>
                );

                return (
                  <li key={`${hit.where}:${hit.label}`}>
                    {hit.href ? (
                      <Link
                        href={hit.href}
                        className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-slate-800/50"
                      >
                        <div className="min-w-0">{body}</div>
                        <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-600" />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => open(hit)}
                        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-800/50"
                      >
                        <div className="min-w-0">{body}</div>
                        <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-600" />
                      </button>
                    )}
                  </li>
                );
              })}
              {hits.length > shown.length && (
                <li className="px-3 py-2 text-[11px] text-slate-600">
                  +{hits.length - shown.length} more — keep typing to narrow it
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
