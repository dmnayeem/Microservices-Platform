"use client";

import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/user/primitives/avatar";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { CreateGroupModal } from "./create-group-modal";
import type { GroupSummary } from "./social-feed-view.types";

// ─────────────────────────────────────────────────────────────────────────────
// Groups Tab — real implementation
// ─────────────────────────────────────────────────────────────────────────────

export function GroupsTab() {
  const [scope, setScope] = useState<"mine" | "discover">("mine");
  const [mine, setMine] = useState<GroupSummary[]>([]);
  const [discover, setDiscover] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [m, d] = await Promise.all([
        fetch("/api/groups?scope=mine").then((r) =>
          r.ok ? r.json() : { groups: [] }
        ),
        fetch("/api/groups?scope=discover").then((r) =>
          r.ok ? r.json() : { groups: [] }
        ),
      ]);
      setMine(m.groups ?? []);
      setDiscover(d.groups ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const join = async (g: GroupSummary) => {
    setBusyId(g.id);
    try {
      const res = await fetch(`/api/groups/${g.id}/join`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.status === "joined") {
        toast.success(`Joined ${g.name}`);
      } else {
        toast.success("Join request sent");
      }
      load();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusyId(null);
    }
  };

  const list = scope === "mine" ? mine : discover;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 flex-1">
          {(["mine", "discover"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                "flex-1 py-1.5 text-xs font-semibold rounded transition-colors",
                scope === s ? "bg-indigo-500 text-white" : "text-gray-400"
              )}
            >
              {s === "mine"
                ? `My Groups${mine.length ? ` · ${mine.length}` : ""}`
                : `Discover${discover.length ? ` · ${discover.length}` : ""}`}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      {loading && <ListSkeleton rows={3} />}

      {!loading && list.length === 0 && (
        <EmptyState
          icon={Users}
          title={
            scope === "mine"
              ? "You haven't joined any groups yet"
              : "No public groups to discover"
          }
          description={
            scope === "mine"
              ? "Browse the Discover tab to find communities to join."
              : "Be the first — create one!"
          }
        />
      )}

      {!loading && list.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((g) => (
            <div
              key={g.id}
              className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-start gap-3"
            >
              <Avatar
                src={g.avatarUrl}
                size={48}
                fallbackIcon={<Users className="w-5 h-5" />}
                className="rounded-xl shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-white truncate">
                    {g.name}
                  </p>
                  {g.type === "PRIVATE" && (
                    <span className="text-[10px] uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">
                      Private
                    </span>
                  )}
                  {g.isOwner && (
                    <span className="text-[10px] uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                      Owner
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">
                  {g.memberCount.toLocaleString()} member{g.memberCount === 1 ? "" : "s"}
                </p>
                {g.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                    {g.description}
                  </p>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  <Link
                    href={`/groups/${g.id}`}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Open →
                  </Link>
                  {scope === "discover" && !g.hasPendingRequest && (
                    <button
                      onClick={() => join(g)}
                      disabled={busyId === g.id}
                      className="ml-auto px-3 py-1 rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 text-xs font-bold disabled:opacity-50"
                    >
                      {busyId === g.id
                        ? "…"
                        : g.type === "PRIVATE"
                        ? "Request to join"
                        : "Join"}
                    </button>
                  )}
                  {g.hasPendingRequest && (
                    <span className="ml-auto text-[11px] text-amber-400 font-semibold">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}
