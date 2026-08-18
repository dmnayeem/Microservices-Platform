"use client";

import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useState } from "react";

interface AdminOption {
  id: string;
  label: string;
}

interface Props {
  basePath: string; // "/admin/admin-activity" | "/admin/user-activity"
  admins?: AdminOption[]; // actor dropdown (admin-activity only)
  actions?: string[]; // action dropdown
  current: {
    actor?: string;
    action?: string;
    q?: string;
    days?: string;
  };
  /** Label + placeholder for the free-text search (target user vs. user). */
  searchLabel?: string;
}

/**
 * Shared filter bar for the Admin Activity + User Activity pages. Pushes filter
 * state into the URL (`searchParams`) so the server component re-queries.
 */
export function ActivityFilterBar({
  basePath,
  admins,
  actions,
  current,
  searchLabel = "Search user (name / email / id)",
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? "");

  const push = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = { ...current, ...patch };
    if (merged.actor) params.set("actor", merged.actor);
    if (merged.action) params.set("action", merged.action);
    if (merged.q) params.set("q", merged.q);
    if (merged.days) params.set("days", merged.days);
    params.set("page", "1");
    router.push(`${basePath}?${params.toString()}`);
  };

  const selectCls =
    "px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {admins && admins.length > 0 && (
        <select
          value={current.actor ?? ""}
          onChange={(e) => push({ actor: e.target.value })}
          className={selectCls}
        >
          <option value="">All admins</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      )}

      {actions && actions.length > 0 && (
        <select
          value={current.action ?? ""}
          onChange={(e) => push({ action: e.target.value })}
          className={selectCls}
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      )}

      <select
        value={current.days ?? ""}
        onChange={(e) => push({ days: e.target.value })}
        className={selectCls}
      >
        <option value="">All time</option>
        <option value="1">Today</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
      </select>

      {/* Free-text user search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          push({ q });
        }}
        className="relative flex-1 min-w-[220px]"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchLabel}
          className="w-full pl-9 pr-8 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              push({ q: "" });
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>
    </div>
  );
}
