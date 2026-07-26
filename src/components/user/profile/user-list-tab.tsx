"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Users, Coins, UserCheck, UserPlus } from "lucide-react";
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
      <div className="text-center py-12 text-gray-500 text-sm inline-flex items-center justify-center gap-2 w-full">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center">
        <Users className="w-10 h-10 text-gray-700 mx-auto mb-2" />
        <p className="text-sm text-gray-400 font-semibold">No users yet</p>
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
                <p className="text-sm font-bold text-white truncate inline-flex items-center gap-1">
                  {u.name ?? u.username ?? "User"}
                  {u.isBlueVerified && (
                    <VerifiedBadge
                      style={u.verifiedBadgeStyle}
                      size="sm"
                    />
                  )}
                </p>
              </Link>
              {u.username && <p className="text-[11px] text-gray-500">@{u.username}</p>}
              <p className="text-[11px] text-gray-400 inline-flex items-center gap-1 mt-0.5">
                <Coins className="w-3 h-3 text-amber-400" />
                {u.followersCount.toLocaleString()} followers
              </p>
            </div>
            {u.id !== viewerId && (
              <button
                onClick={() => toggle(u)}
                disabled={busyId === u.id}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 inline-flex items-center gap-1",
                  u.isFollowing
                    ? "bg-gray-800 text-white border border-gray-700"
                    : "bg-indigo-500 hover:bg-indigo-600 text-white"
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
