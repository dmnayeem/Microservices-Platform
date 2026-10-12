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
        <div className="flex bg-(--app-surface) border border-(--app-line) rounded-lg p-1 flex-1">
          {(["mine", "discover"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                "app-press min-h-10 flex-1 px-2 text-sm font-semibold rounded-md transition-colors",
                scope === s ? "bg-(--app-cta) text-(--app-on-cta)" : "text-(--app-ink-3)"
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
          className="app-press app-tap-row shrink-0 inline-flex items-center gap-1.5 px-4 bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-bold rounded-lg"
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
              className="rounded-xl border border-(--app-line) bg-(--app-surface) p-4 flex items-start gap-3"
            >
              <Avatar
                src={g.avatarUrl}
                size={48}
                fallbackIcon={<Users className="w-5 h-5" />}
                className="rounded-xl shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="text-sm font-bold text-white truncate">
                    {g.name}
                  </p>
                  {g.type === "PRIVATE" && (
                    <span className="shrink-0 text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">
                      Private
                    </span>
                  )}
                  {g.isOwner && (
                    <span className="shrink-0 text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                      Owner
                    </span>
                  )}
                </div>
                <p className="text-xs text-(--app-ink-3)">
                  {g.memberCount.toLocaleString()} member{g.memberCount === 1 ? "" : "s"}
                </p>
                {g.description && (
                  <p className="text-sm text-(--app-ink-2) mt-1 line-clamp-2">
                    {g.description}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <Link
                    href={`/groups/${g.id}`}
                    className="app-press app-tap-row inline-flex items-center text-sm text-(--app-accent-ink) hover:text-(--app-accent-ink) font-semibold"
                  >
                    Open →
                  </Link>
                  {scope === "discover" && !g.hasPendingRequest && (
                    <button
                      onClick={() => join(g)}
                      disabled={busyId === g.id}
                      className="app-press app-tap-row ml-auto inline-flex items-center px-4 rounded-lg bg-(--app-cta)/10 text-(--app-accent-ink) hover:bg-(--app-cta)/20 text-sm font-bold disabled:opacity-50"
                    >
                      {busyId === g.id
                        ? "…"
                        : g.type === "PRIVATE"
                        ? "Request to join"
                        : "Join"}
                    </button>
                  )}
                  {g.hasPendingRequest && (
                    <span className="ml-auto text-xs text-amber-400 font-semibold">
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
