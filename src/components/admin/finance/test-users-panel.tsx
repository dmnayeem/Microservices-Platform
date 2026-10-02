"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical, Loader2, Search, X } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * Finance → Test users.
 *
 * Accounts admins test the platform with. Marking one leaves everything about
 * it out of every finance figure (balances, points, revenue, withdrawals,
 * deposits, ad spend, ledger, CSV). Outside finance the account is untouched.
 */

interface U {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  role: string;
  isTest?: boolean;
}

export function TestUsersPanel({ canManage }: { canManage: boolean }) {
  const [list, setList] = useState<U[]>([]);
  const [max, setMax] = useState(500);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<U[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/finance/test-users");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load test users.");
      setList(d.testUsers ?? []);
      setMax(d.max ?? 500);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced search — one request per pause in typing, stale answers dropped.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/admin/finance/test-users?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        if (mine !== seq.current) return;
        if (!r.ok) throw new Error(d.error || "Search failed.");
        setResults(d.users ?? []);
      } catch (e) {
        if (mine === seq.current) toast.error((e as Error).message);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function change(u: U, action: "add" | "remove") {
    setBusy(u.id);
    try {
      const r = await fetch("/api/admin/finance/test-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, action }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not save.");
      toast.success(
        action === "add"
          ? `${u.name || u.email} is now a test user — excluded from finance.`
          : `${u.name || u.email} counts in finance again.`
      );
      setResults((rs) => rs?.map((x) => (x.id === u.id ? { ...x, isTest: action === "add" } : x)) ?? rs);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const who = (u: U) => (
    <span className="min-w-0">
      <span className="block truncate text-sm text-white">
        {u.name || u.username || "Unnamed"}
        {u.role !== "USER" && (
          <span className="ml-1.5 text-[10px] font-semibold text-amber-300">{u.role}</span>
        )}
      </span>
      <span className="block truncate text-[11px] text-slate-500">
        {u.email} · <span className="font-mono">{u.id}</span>
      </span>
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm font-semibold text-white flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-sky-400" />
          Test users
        </p>
        <p className="text-[12px] text-slate-400 mt-1">
          Accounts admins use to test the platform. Everything about a test user —
          balances, points, deposits, withdrawals, ad funding, purchases, revenue
          and ledger rows — is left out of every finance figure, chart and export,
          so the books show only real money. Outside finance (their wallet,
          profile, leaderboards, the withdrawal queue) nothing changes.
        </p>
        {!canManage && (
          <p className="text-[12px] text-amber-300/90 mt-2">
            You can view this list. Changing it needs the &quot;Finance settings&quot; permission.
          </p>
        )}
      </div>

      {canManage && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, username or user id…"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 pl-9 pr-9 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
            {searching && (
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>
          {results && (
            results.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-3">No users match.</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {results.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                    {who(u)}
                    {u.isTest ? (
                      <button
                        type="button"
                        disabled={busy === u.id}
                        onClick={() => change(u, "remove")}
                        className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-500 disabled:opacity-50"
                      >
                        Unmark
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === u.id || list.length >= max}
                        onClick={() => change(u, "add")}
                        className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                      >
                        Mark as test user
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm font-semibold text-white mb-2">
          Current test users{" "}
          <span className="text-xs font-normal text-slate-500">
            {list.length} of at most {max}
          </span>
        </p>
        {loading ? (
          <p className="text-xs text-slate-500 py-4 text-center">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No test users. Every account counts in finance.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {list.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                {who(u)}
                {canManage && (
                  <button
                    type="button"
                    disabled={busy === u.id}
                    onClick={() => change(u, "remove")}
                    aria-label={`Remove ${u.email} from test users`}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-slate-600 mt-3">
          Changes reach every finance screen within about a minute (cached
          figures refresh on their own).
        </p>
      </div>
    </div>
  );
}
