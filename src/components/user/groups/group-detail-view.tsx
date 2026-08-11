"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/lib/confirm";
import {
  ChevronLeft,
  Users,
  Lock,
  Crown,
  Loader2,
  Check,
  X,
  LogOut,
} from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { Avatar } from "@/components/user/primitives/avatar";
import { RenderedContent } from "@/components/user/feed/feed-content";
import { toast } from "@/lib/toast";
import { format } from "date-fns";

interface GroupPost {
  id: string;
  content: string;
  images: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  user?: { name?: string | null; username?: string | null; avatar?: string | null } | null;
}

interface PendingRequest {
  id: string;
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  createdAt: string;
}

interface GroupDetail {
  group: {
    id: string;
    name: string;
    description: string | null;
    type: "PUBLIC" | "PRIVATE";
    avatarUrl: string | null;
    bannerUrl: string | null;
    memberCount: number;
    ownerId: string;
    createdAt: string;
  };
  myRole: "OWNER" | "ADMIN" | "MEMBER" | null;
  isMember: boolean;
  isOwner: boolean;
  hasPendingRequest: boolean;
  pendingRequests: PendingRequest[];
}

interface Props {
  groupId: string;
  currentUserId: string;
}

export function GroupDetailView({ groupId }: Props) {
  const router = useRouter();
  const [data, setData] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [groupPosts, setGroupPosts] = useState<GroupPost[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      if (!res.ok) throw new Error(await res.text());
      const d = (await res.json()) as GroupDetail;
      setData(d);
    } catch (err) {
      toast.error("Couldn't load group", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Load the group-filtered feed once we know the viewer is a member.
  useEffect(() => {
    if (!data?.isMember) return;
    let active = true;
    fetch(`/api/feed?groupId=${groupId}&limit=20`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setGroupPosts(d.posts ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [data?.isMember, groupId]);

  const join = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/join`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(d.status === "joined" ? "Joined!" : "Request sent");
      load();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!(await confirmDialog({ title: "Leave this group?", tone: "info", confirmLabel: "Leave" }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/leave`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Left group");
      router.push("/social");
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
      setBusy(false);
    }
  };

  const decide = async (
    reqId: string,
    action: "approve" | "reject"
  ) => {
    try {
      const res = await fetch(
        `/api/groups/${groupId}/requests/${reqId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(action === "approve" ? "Approved" : "Rejected");
      load();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <ListSkeleton rows={5} />
      </div>
    );
  }

  if (!data) return null;

  const { group, myRole, isMember, isOwner, hasPendingRequest, pendingRequests } =
    data;

  return (
    <div className="space-y-4">
      <Link
        href="/social"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to community
      </Link>

      {/* Banner / header */}
      <div className="relative rounded-2xl overflow-hidden border border-gray-800">
        <div className="relative h-28 bg-linear-to-br from-indigo-500 to-purple-600">
          {group.bannerUrl && (
            <SmartImage
              src={group.bannerUrl}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
            />
          )}
        </div>
        <div className="bg-gray-900 p-4 -mt-8 relative">
          <div className="flex items-end gap-3">
            <Avatar
              src={group.avatarUrl}
              size={64}
              shape="rounded"
              fallbackStyle="solid-gray"
              fallbackIcon={<Users className="w-7 h-7" />}
              className="border-4 border-gray-900 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white truncate">
                  {group.name}
                </h1>
                {group.type === "PRIVATE" && (
                  <Lock className="w-4 h-4 text-amber-400" />
                )}
                {isOwner && <Crown className="w-4 h-4 text-amber-400" />}
              </div>
              <p className="text-xs text-gray-500">
                {group.memberCount.toLocaleString()} member
                {group.memberCount === 1 ? "" : "s"} · created{" "}
                {format(new Date(group.createdAt), "MMM d, yyyy")}
              </p>
            </div>
          </div>
          {group.description && (
            <p className="text-sm text-gray-300 mt-3">{group.description}</p>
          )}
          <div className="mt-3 flex gap-2">
            {!isMember && !hasPendingRequest && (
              <button
                onClick={join}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {group.type === "PRIVATE" ? "Request to join" : "Join group"}
              </button>
            )}
            {hasPendingRequest && (
              <span className="px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-bold">
                Request pending
              </span>
            )}
            {isMember && !isOwner && (
              <button
                onClick={leave}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                Leave group
              </button>
            )}
            <span className="ml-auto text-xs text-gray-500 self-center">
              {myRole === "OWNER"
                ? "You own this group"
                : myRole === "ADMIN"
                ? "You are an admin"
                : myRole === "MEMBER"
                ? "Member"
                : null}
            </span>
          </div>
        </div>
      </div>

      {/* Pending requests (admin only) */}
      {pendingRequests.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-bold text-amber-400 mb-3">
            Pending Join Requests ({pendingRequests.length})
          </p>
          <div className="space-y-2">
            {pendingRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-950 border border-gray-800"
              >
                <Avatar
                  src={r.userAvatar}
                  size={36}
                  fallbackStyle="solid-gray"
                  fallbackText={(r.userName ?? "U")[0]?.toUpperCase()}
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {r.userName ?? "Unknown"}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {format(new Date(r.createdAt), "PP p")}
                  </p>
                </div>
                <button
                  onClick={() => decide(r.id, "approve")}
                  className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  title="Approve"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => decide(r.id, "reject")}
                  className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  title="Reject"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Group-filtered feed */}
      {!isMember ? (
        <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center">
          <p className="text-sm text-gray-400">
            Join this group to see posts and contribute.
          </p>
        </div>
      ) : groupPosts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center">
          <p className="text-sm text-gray-400">
            No posts in this group yet. Create a post in the{" "}
            <Link href="/social" className="text-indigo-400 hover:text-indigo-300">
              feed
            </Link>{" "}
            and tag this group.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupPosts.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-gray-800 bg-gray-900 p-3"
            >
              <div className="flex items-center gap-2">
                <Avatar
                  src={p.user?.avatar}
                  size={32}
                  fallbackText={(p.user?.name || p.user?.username || "U").charAt(0)}
                  className="shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {p.user?.name || p.user?.username || "User"}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {format(new Date(p.createdAt), "MMM d, h:mm a")}
                  </p>
                </div>
              </div>
              {p.content && (
                <p className="mt-2 text-sm text-gray-200 whitespace-pre-wrap wrap-break-word">
                  <RenderedContent content={p.content} />
                </p>
              )}
              {p.images?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.images[0]}
                  alt=""
                  className="mt-2 w-full max-h-80 object-cover rounded-lg border border-gray-800"
                />
              )}
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                <span>❤ {p.likesCount}</span>
                <span>💬 {p.commentsCount}</span>
                <Link href="/social" className="ml-auto text-indigo-400 hover:text-indigo-300">
                  Open in feed
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
