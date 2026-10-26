"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, Search, UserPlus, X } from "lucide-react";

export type PickedUser = { id: string; name: string | null; email: string };

/**
 * Super admin only: make a task private (other admins/staff never see it in
 * the admin panel) and/or give it to selected members only. The server
 * ignores both fields from anyone else (lib/task-privacy-server.ts).
 */
export function PrivateTaskFields({
  superAdminOnly,
  onSuperAdminOnly,
  users,
  onUsers,
}: {
  superAdminOnly: boolean;
  onSuperAdminOnly: (v: boolean) => void;
  users: PickedUser[];
  onUsers: (u: PickedUser[]) => void;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PickedUser[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/admin/users/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as { users?: PickedUser[] };
        if (my === seq.current) setFound(j.users ?? []);
      } finally {
        if (my === seq.current) setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const taken = new Set(users.map((u) => u.id));
  const results = q.trim().length < 2 ? [] : found.filter((u) => !taken.has(u.id)).slice(0, 8);

  return (
    <div className="md:col-span-2 space-y-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-purple-200">
        <Lock className="h-4 w-4" /> Private task <span className="text-[11px] font-normal text-purple-300/70">· super admin only</span>
      </p>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={superAdminOnly} onChange={(e) => onSuperAdminOnly(e.target.checked)} className="mt-0.5 h-4 w-4 accent-purple-500" />
        <span>
          <span className="text-sm font-medium text-gray-200">Hide from admins, managers and staff</span>
          <span className="block text-[11px] text-gray-500">
            Only you see it in the admin panel — task lists, submissions, review, analytics and exports. You review its
            submissions yourself. Money totals still count it.
          </span>
        </span>
      </label>

      <div>
        <p className="text-sm font-medium text-gray-200">Only these members can see and do it</p>
        <p className="mb-2 text-[11px] text-gray-500">Leave empty for everyone the audience settings allow. Add people to make it theirs only.</p>
        {users.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {users.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2.5 py-1 text-xs text-purple-100">
                {u.name || u.email}
                <button type="button" onClick={() => onUsers(users.filter((x) => x.id !== u.id))} aria-label={`Remove ${u.name || u.email}`} className="text-purple-300 hover:text-white">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <span className="self-center text-[11px] text-gray-500">{users.length} selected</span>
          </div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a member by name, email or username…"
            className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-9 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
          />
          {busy && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-500" />}
        </div>
        {results.length > 0 && (
          <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => {
                    onUsers([...users, { id: u.id, name: u.name, email: u.email }]);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800"
                >
                  <UserPlus className="h-3.5 w-3.5 text-purple-300" />
                  <span className="min-w-0 flex-1 truncate">{u.name || u.email}</span>
                  <span className="truncate text-[11px] text-gray-500">{u.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
