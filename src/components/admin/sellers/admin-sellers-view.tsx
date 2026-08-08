"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, GraduationCap, Store, Megaphone, Check, Store as StoreIcon } from "lucide-react";

type Cap = "sellCourses" | "sellMarketplace" | "advertiser";

interface SellerUser {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  avatar: string | null;
  role: string;
  capabilities: Record<Cap, boolean>;
}

const CAPS: { key: Cap; label: string; icon: typeof GraduationCap; tone: string }[] = [
  { key: "sellCourses", label: "Sell Courses", icon: GraduationCap, tone: "text-sky-400" },
  { key: "sellMarketplace", label: "Sell Marketplace", icon: Store, tone: "text-fuchsia-400" },
  { key: "advertiser", label: "Run Ads", icon: Megaphone, tone: "text-indigo-400" },
];

export function AdminSellersView({ canManage = false }: { canManage?: boolean }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SellerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((q: string) => {
    setLoading(true);
    fetch(`/api/admin/sellers${q ? `?search=${encodeURIComponent(q)}` : ""}`)
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(query); }, [load, query]);

  const toggle = async (u: SellerUser, cap: Cap) => {
    if (!canManage) return;
    const enabled = !u.capabilities[cap];
    setBusy(`${u.id}:${cap}`);
    try {
      const res = await fetch("/api/admin/sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, capability: cap, enabled }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, capabilities: d.capabilities } : x))
      );
      toast.success(
        `${enabled ? "Granted" : "Revoked"} ${CAPS.find((c) => c.key === cap)?.label} for ${u.name ?? u.email}`
      );
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <StoreIcon className="w-5 h-5 text-fuchsia-400" /> Seller Access
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Grant a user exactly one selling capability — sell courses, sell on the marketplace,
          or run ads. Granting &ldquo;Sell Courses&rdquo; promotes the user to Tutor.
        </p>
      </div>

      {/* Search */}
      <form
        onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a user by name / email / username to grant access…"
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold">
          Search
        </button>
        {query && (
          <button
            type="button"
            onClick={() => { setSearch(""); setQuery(""); }}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold"
          >
            Clear
          </button>
        )}
      </form>

      <p className="text-xs text-slate-500">
        {query ? `Search results for "${query}"` : "Current sellers (users with a selling capability granted)"}
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">
          {query ? "No users match your search." : "No sellers yet — search a user to grant access."}
        </p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">
                  {u.name ?? u.username ?? u.email}
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">{u.role}</span>
                </p>
                <p className="text-xs text-slate-500 truncate">{u.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {CAPS.map((c) => {
                  const on = u.capabilities[c.key];
                  const isBusy = busy === `${u.id}:${c.key}`;
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggle(u, c.key)}
                      disabled={!canManage || isBusy}
                      className={
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 " +
                        (on
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600")
                      }
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : on ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <c.icon className={`w-3.5 h-3.5 ${c.tone}`} />
                      )}
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
