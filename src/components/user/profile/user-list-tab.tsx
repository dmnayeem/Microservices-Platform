"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { Loader2, Users, UserCheck, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { profileHref } from "@/lib/user-href";
import { Avatar } from "@/components/user/primitives/avatar";
import { VerifiedBadge } from "@/components/user/profile/verified-badge";
import type { UserListItem } from "./profile-view.types";

export function UserListTab({
  endpoint,
  viewerId,
}: {
  endpoint: string;
  viewerId: string;
}) {
  const [items, setItems] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch(`${endpoint}?limit=30`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancel) setItems(d.items ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [endpoint]);

  const toggle = async (target: UserListItem) => {
    setBusyId(target.id);
    try {
      const r = await fetch(`/api/users/${target.id}/follow`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setItems((prev) =>
        prev.map((u) =>
          u.id === target.id
            ? {
                ...u,
                isFollowing: !!d.following,
                followersCount:
                  typeof d.followersCount === "number"
                    ? d.followersCount
                    : u.followersCount,
              }
            : u
        )
      );
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      // Rows in the list's own shape, so the page does not jump when it lands.
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 glass">
            <div className="h-11 w-11 shrink-0 rounded-full bg-(--app-surface-2) animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/5 rounded bg-(--app-surface-2) animate-pulse" />
              <div className="h-3 w-1/4 rounded bg-(--app-surface-2) animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-(--app-line) p-10 text-center">
        <Users className="w-10 h-10 text-(--app-ink-3) mx-auto mb-2" />
        <p className="text-sm text-(--app-ink-2) font-semibold">No one here yet</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((u) => {
        const initial = (u.name ?? u.username ?? "U").charAt(0).toUpperCase();
        return (
          <div
            key={u.id}
            className="flex items-center gap-3 p-3 glass glass-hover"
          >
            <Link href={profileHref(u)} className="shrink-0">
              <Avatar src={u.avatar} size={44} fallbackText={initial} />
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={profileHref(u)} className="block">
                <p className="text-sm font-bold text-white flex min-w-0 items-center gap-1">
                  <span className="truncate">{u.name ?? u.username ?? "User"}</span>
                  {u.isBlueVerified && (
                    <VerifiedBadge
                      style={u.verifiedBadgeStyle}
                      size="sm"
                    />
                  )}
                </p>
              </Link>
              {u.username && <p className="text-xs text-(--app-ink-3) truncate">@{u.username}</p>}
              <p className="text-xs text-(--app-ink-3) inline-flex items-center gap-1 mt-0.5">
                {/* People, not a coin: a coin here read as money earned. */}
                <Users className="w-3.5 h-3.5" />
                {u.followersCount.toLocaleString()} followers
              </p>
            </div>
            {u.id !== viewerId && (
              <button
                onClick={() => toggle(u)}
                disabled={busyId === u.id}
                className={cn(
                  "app-press app-tap-row shrink-0 min-w-24 justify-center px-3 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 inline-flex items-center gap-1.5",
                  u.isFollowing
                    ? "bg-(--app-surface-2) text-(--app-ink) border border-(--app-line)"
                    : "bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta)"
                )}
              >
                {busyId === u.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : u.isFollowing ? (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    Follow
                  </>
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
