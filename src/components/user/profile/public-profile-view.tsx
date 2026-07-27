"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileHref } from "@/lib/user-href";
import {
  Loader2,
  Calendar,
  MapPin,
  UserPlus,
  UserCheck,
  Coins,
  Crown,
  Lock,
} from "lucide-react";
import { VerifiedBadge } from "@/components/user/profile/verified-badge";
import { RenderedContent } from "@/components/user/feed/feed-content";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { Avatar } from "@/components/user/primitives/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SocialStatsGroup,
  LifetimeStatsGroup,
} from "@/components/user/profile/profile-stat-groups";

interface LifetimeStats {
  totalEarnedPoints: number | null;
  totalEarnedUsd: number | null;
  tasksCompleted: number;
  rank: number;
  totalXp: number;
  level: number;
  team: number;
}

interface ProfileResp {
  user: {
    id: string;
    name: string | null;
    username: string | null;
    avatar: string | null;
    coverPhoto: string | null;
    bio: string | null;
    country: string | null;
    tags: string[];
    level: number;
    isBlueVerified: boolean;
    verifiedBadgeStyle: string | null;
    packageTier: string;
    createdAt: string;
    postsCount: number | null;
    followersCount: number | null;
    followingCount: number | null;
    lifetime: LifetimeStats | null;
  };
  viewer: {
    isMe: boolean;
    isFollowing: boolean;
    isFollowedBy: boolean;
  };
}

interface Props {
  userId: string;
  viewerId: string;
}

const TAG_LABEL: Record<string, string> = {
  EARLY_ADOPTER: "🚀 Early Adopter",
  VERIFIED: "✓ Verified",
  CRYPTO: "₿ Crypto",
  TRADER: "📈 Trader",
  GAMER: "🎮 Gamer",
  INFLUENCER: "📣 Influencer",
  WHALE: "🐋 Whale",
  PRO: "🏆 Pro",
  ELITE: "💎 Elite",
  CREATOR: "🎨 Creator",
};

type Tab = "posts" | "followers" | "following";

export function PublicProfileView({ userId, viewerId }: Props) {
  const [data, setData] = useState<ProfileResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("posts");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/users/${userId}/profile`);
      if (!r.ok) throw new Error(await r.text());
      setData((await r.json()) as ProfileResp);
    } catch (err) {
      toast.error("Couldn't load profile", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const toggleFollow = async () => {
    setFollowBusy(true);
    try {
      const r = await fetch(`/api/users/${userId}/follow`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      // Optimistic refresh
      setData((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                followersCount:
                  typeof d.followersCount === "number"
                    ? d.followersCount
                    : prev.user.followersCount,
              },
              viewer: {
                ...prev.viewer,
                isFollowing: !!d.following,
              },
            }
          : prev
      );
      toast.success(d.following ? "Following" : "Unfollowed");
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const { user, viewer } = data;
  const displayName = user.name ?? user.username ?? "User";
  const initial = displayName.charAt(0).toUpperCase();
  const statsHidden = user.postsCount === null;

  return (
    <div className="space-y-5">
      {/* Header — cover + avatar */}
      <div className="rounded-2xl overflow-hidden glass">
        <div className="relative h-32 sm:h-44 bg-linear-to-br from-indigo-600 via-purple-600 to-pink-600">
          {user.coverPhoto && (
            <SmartImage
              src={user.coverPhoto}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
            />
          )}
        </div>
        <div className="bg-gray-900 px-4 sm:px-6 pt-12 pb-5 relative">
          <div className="absolute -top-12 left-4 sm:left-6">
            <Avatar
              src={user.avatar}
              size="w-24 h-24 sm:w-28 sm:h-28"
              shape="rounded"
              fallbackText={initial}
              className="border-4 border-gray-900"
            />
          </div>

          <div className="flex justify-end mb-2">
            {viewer.isMe ? (
              <Link
                href="/profile"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold"
              >
                Edit Profile
              </Link>
            ) : (
              <button
                onClick={toggleFollow}
                disabled={followBusy}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50",
                  viewer.isFollowing
                    ? "bg-gray-800 text-white border border-gray-700 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30"
                    : "bg-indigo-500 hover:bg-indigo-600 text-white"
                )}
              >
                {followBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : viewer.isFollowing ? (
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

          <div className="flex items-start gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-white">{displayName}</h1>
            {user.isBlueVerified && (
              <span className="mt-1.5">
                <VerifiedBadge
                  style={user.verifiedBadgeStyle}
                  size="md"
                />
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
              <Crown className="w-3 h-3" />
              {user.packageTier}
            </span>
          </div>
          {user.username && (
            <p className="text-gray-500 text-sm">@{user.username}</p>
          )}
          {viewer.isFollowedBy && !viewer.isMe && (
            <span className="inline-block mt-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 font-bold">
              Follows you
            </span>
          )}
          {user.bio && (
            <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">{user.bio}</p>
          )}
          <div className="flex items-center flex-wrap gap-3 mt-3 text-xs text-gray-400">
            {user.country && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {user.country}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Joined{" "}
              {new Date(user.createdAt).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          {user.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {user.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-[11px] font-medium border border-indigo-500/30"
                >
                  {TAG_LABEL[t] ?? t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats — Social group + Lifetime panel, both privacy-gated */}
      {statsHidden ? (
        <div className="glass p-4 text-center text-xs text-gray-500 inline-flex items-center justify-center gap-2 w-full">
          <Lock className="w-4 h-4" />
          This user&apos;s stats are private.
        </div>
      ) : (
        <div className="space-y-4">
          <SocialStatsGroup
            posts={user.postsCount}
            followers={user.followersCount}
            following={user.followingCount}
          />
          {user.lifetime && <LifetimeStatsGroup stats={user.lifetime} />}
        </div>
      )}

      {/* Tab nav */}
      <nav className="flex gap-1 border-b border-gray-800 overflow-x-auto scrollbar-none">
        {(
          [
            { key: "posts", label: "Posts" },
            { key: "followers", label: "Followers" },
            { key: "following", label: "Following" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "text-white border-b-2 border-indigo-500"
                : "text-gray-400 hover:text-white"
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "posts" && <PostsTab userId={userId} />}
      {tab === "followers" && <UserListTab endpoint={`/api/users/${userId}/followers`} viewerId={viewerId} />}
      {tab === "following" && <UserListTab endpoint={`/api/users/${userId}/following`} viewerId={viewerId} />}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

interface ApiPost {
  id: string;
  content: string;
  images: string[];
  isPinned: boolean;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  createdAt: string;
  isLiked: boolean;
}

function PostsTab({ userId }: { userId: string }) {
  const [items, setItems] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    fetch(`/api/users/${userId}/posts?limit=20`)
      .then((r) => r.json())
      .then((d) => {
        if (cancel) return;
        setItems(d.posts ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">Loading posts…</div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center text-sm text-gray-500">
        No posts yet.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((p) => (
        <div key={p.id} className="glass p-4">
          {p.content && (
            <p className="text-sm text-gray-200 whitespace-pre-wrap">
              <RenderedContent content={p.content} />
            </p>
          )}
          {p.images.length > 0 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.images[0]} alt="" className="mt-3 w-full max-h-80 rounded-lg object-cover bg-gray-950" />
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span>{p.viewsCount} views</span>
            <span>♥ {p.likesCount}</span>
            <span>💬 {p.commentsCount}</span>
            <span className="ml-auto">
              {new Date(p.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

interface UserListItem {
  id: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
  isBlueVerified: boolean;
  verifiedBadgeStyle: string | null;
  followersCount: number;
  isFollowing: boolean;
}

function UserListTab({
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
    return <div className="text-center py-8 text-gray-500 text-sm">Loading…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center text-sm text-gray-500">
        No users yet.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((u) => {
        const initial = (u.name ?? u.username ?? "U").charAt(0).toUpperCase();
        return (
          <div
            key={u.id}
            className="flex items-center gap-3 p-3 glass glass-hover"
          >
            <Link href={profileHref(u)}>
              <Avatar src={u.avatar} size={40} fallbackText={initial} />
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={profileHref(u)} className="block">
                <p className="text-sm font-bold text-white truncate inline-flex items-center gap-1">
                  {u.name ?? u.username ?? "User"}
                  {u.isBlueVerified && (
                    <VerifiedBadge style={u.verifiedBadgeStyle} size="sm" />
                  )}
                </p>
              </Link>
              {u.username && (
                <p className="text-[11px] text-gray-500">@{u.username}</p>
              )}
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
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50",
                  u.isFollowing
                    ? "bg-gray-800 text-white border border-gray-700"
                    : "bg-indigo-500 hover:bg-indigo-600 text-white"
                )}
              >
                {busyId === u.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : u.isFollowing ? (
                  "Following"
                ) : (
                  "Follow"
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
