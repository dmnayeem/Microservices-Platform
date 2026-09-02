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
  Briefcase,
  Languages,
  Globe,
  GraduationCap,
  ShoppingBag,
  CheckCircle2,
  User,
  Cake,
  Droplet,
  Heart,
  Clock,
  Eye,
  MessageCircle,
  Pin,
  X,
} from "lucide-react";
import { VerifiedBadge } from "@/components/user/profile/verified-badge";
import { RenderedContent } from "@/components/user/feed/feed-content";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { Avatar } from "@/components/user/primitives/avatar";
import { toast } from "@/lib/toast";
import { LANGUAGES } from "./profile-view.constants";
import { getPostBackground } from "@/lib/post-backgrounds";
import { cn } from "@/lib/utils";
import {
  SocialStatsGroup,
  LifetimeStatsGroup,
} from "@/components/user/profile/profile-stat-groups";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

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
    profession: string | null;
    nationality: string | null;
    language: string | null;
    gender: string | null;
    dateOfBirth: string | null;
    bloodGroup: string | null;
    maritalStatus: string | null;
    studyLevel: string | null;
    timezone: string | null;
    city: string | null;
    district: string | null;
    socialAccounts: {
      id: string;
      platform: string;
      username: string;
      url: string | null;
      verified: boolean;
    }[];
    creations: { coursesCreated: number; marketplaceListings: number };
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

  // Built as a list rather than a wall of conditional JSX so the card lays out
  // evenly whatever is filled in: two facts and twelve both flow into the same
  // grid instead of leaving holes where the empty ones would have been.
  const aboutFacts: { icon: React.ReactNode; label: string; value: string }[] = [];
  const fact = (icon: React.ReactNode, label: string, value?: string | null) => {
    if (value) aboutFacts.push({ icon, label, value });
  };
  const titleCase = (v: string) =>
    v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ");

  fact(<Briefcase className="w-3.5 h-3.5" />, "Works as", user.profession);
  fact(
    <Languages className="w-3.5 h-3.5" />,
    "Speaks",
    user.language
      ? (LANGUAGES.find((l) => l.code === user.language)?.name ?? user.language)
      : null
  );
  fact(<Globe className="w-3.5 h-3.5" />, "Nationality", user.nationality);
  fact(
    <User className="w-3.5 h-3.5" />,
    "Gender",
    user.gender ? titleCase(user.gender) : null
  );
  fact(
    <Cake className="w-3.5 h-3.5" />,
    "Birthday",
    user.dateOfBirth
      ? new Date(user.dateOfBirth).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : null
  );
  fact(<Droplet className="w-3.5 h-3.5" />, "Blood group", user.bloodGroup);
  fact(
    <Heart className="w-3.5 h-3.5" />,
    "Marital status",
    user.maritalStatus ? titleCase(user.maritalStatus) : null
  );
  fact(
    <GraduationCap className="w-3.5 h-3.5" />,
    "Education",
    user.studyLevel ? titleCase(user.studyLevel) : null
  );
  // One line, not three: "Dhaka, Dhaka, BD" reads worse than the parts joined
  // and de-duplicated.
  const place = [user.city, user.district, user.country]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(", ");
  fact(<MapPin className="w-3.5 h-3.5" />, "Location", place || null);
  fact(<Clock className="w-3.5 h-3.5" />, "Timezone", user.timezone);
  fact(
    <Calendar className="w-3.5 h-3.5" />,
    "Joined",
    new Date(user.createdAt).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    })
  );

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

      {/* About — everything this person put on their profile.

          The owner asked for "all the user's details except number and email".
          Four things are still absent, and deliberately: email, phone (and the
          secondary pair), the national ID number, and the street / postal code.
          Those are not facts about a person, they are the means to reach,
          impersonate or turn up at one — and a public page that a stranger can
          open is the wrong place for them. Everything that describes WHO
          somebody is, is here. City and district ride behind the same
          `privacyLocation` switch the country already used.

          Rendered as a definition list rather than a paragraph, so a profile
          with two facts and one with twelve both read cleanly. Hidden entirely
          when there is nothing to say. */}
      {aboutFacts.length > 0 ||
      user.socialAccounts.length > 0 ||
      user.creations.coursesCreated > 0 ||
      user.creations.marketplaceListings > 0 ? (
        <section className="glass p-4 sm:p-5">
          <h2 className="text-sm font-bold text-white mb-4">About</h2>

          {aboutFacts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-3">
              {aboutFacts.map((f) => (
                <PublicFact key={f.label} icon={f.icon} label={f.label} value={f.value} />
              ))}
            </div>
          )}

          {(user.creations.coursesCreated > 0 ||
            user.creations.marketplaceListings > 0) && (
            <div
              className={cn(
                "grid grid-cols-2 gap-2.5",
                aboutFacts.length > 0 && "mt-4 pt-4 border-t border-gray-800"
              )}
            >
              {user.creations.coursesCreated > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-emerald-400 shrink-0" />
                    <p className="text-[11px] uppercase tracking-wider text-emerald-300/80 font-bold">
                      Courses
                    </p>
                  </div>
                  <p className="text-xl font-extrabold text-white tabular-nums mt-1">
                    {user.creations.coursesCreated}
                  </p>
                  <p className="text-[11px] text-gray-500">published</p>
                </div>
              )}
              {user.creations.marketplaceListings > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-[11px] uppercase tracking-wider text-amber-300/80 font-bold">
                      Marketplace
                    </p>
                  </div>
                  <p className="text-xl font-extrabold text-white tabular-nums mt-1">
                    {user.creations.marketplaceListings}
                  </p>
                  <p className="text-[11px] text-gray-500">listings</p>
                </div>
              )}
            </div>
          )}

          {user.socialAccounts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2.5">
                Connected accounts
              </p>
              <div className="flex flex-wrap gap-2">
                {user.socialAccounts.map((a) => {
                  const chip = (
                    <>
                      <span className="text-xs font-semibold text-gray-200">
                        {a.platform.charAt(0) + a.platform.slice(1).toLowerCase()}
                      </span>
                      <span className="text-xs text-gray-500 truncate max-w-32">
                        @{a.username}
                      </span>
                      {a.verified && (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      )}
                    </>
                  );
                  // Only a stored URL becomes a link — a bare handle has nowhere
                  // safe to point, and guessing a profile URL per platform is
                  // how you send people to the wrong account.
                  return a.url ? (
                    <a
                      key={a.id}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 transition-colors"
                    >
                      {chip}
                    </a>
                  ) : (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-950 border border-gray-800"
                    >
                      {chip}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      ) : null}
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

      {/* Own-profile has carried this since the space was created; the public
          profile at /u/[id] never did, despite being the one strangers land on. */}
      <AdRenderer placement="PROFILE_BOTTOM" />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

interface ApiPost {
  id: string;
  content: string;
  images: string[];
  backgroundStyle?: string | null;
  isPinned: boolean;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  createdAt: string;
  isLiked: boolean;
}

/**
 * Someone's posts, as a grid.
 *
 * The previous version stacked each post full-width in a plain card: a raw
 * `<img>` at `max-h-80 object-cover`, and the counts printed as "♥ 4  💬 2" in
 * grey text. One post filled the screen, so a profile with a dozen looked like
 * an endless column of banners and you could not see at a glance what the
 * person posts or which of it landed.
 *
 * A square grid answers both — the whole body of work is visible at once, and
 * every tile carries its own numbers. Text-only posts render on the coloured
 * background the feed gives them rather than as empty rectangles, so a profile
 * of text posts still looks like something.
 */
function PostsTab({ userId }: { userId: string }) {
  const [items, setItems] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<ApiPost | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/users/${userId}/posts?limit=30`)
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
    // Skeleton in the grid's own shape, so the page does not jump when the
    // posts land.
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-xl border border-gray-800 bg-gray-900/40 animate-pulse"
          />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center">
        <p className="text-sm text-gray-400 font-semibold">No posts yet</p>
        <p className="text-xs text-gray-600 mt-1">
          Anything they share publicly will show up here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        {items.map((p) => {
          const bg = getPostBackground(p.backgroundStyle);
          const image = p.images[0];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpen(p)}
              className="group relative aspect-square overflow-hidden rounded-xl border border-gray-800 bg-gray-950 text-left transition-colors hover:border-indigo-500/40 focus:outline-none focus-visible:border-indigo-500"
            >
              {image ? (
                <SmartImage
                  src={image}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 50vw, 33vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div
                  className={cn(
                    "absolute inset-0 flex items-center justify-center p-3",
                    bg ? bg.className : "bg-gray-900"
                  )}
                >
                  <p
                    className={cn(
                      "text-center text-xs sm:text-sm font-semibold line-clamp-6",
                      bg ? bg.textClass : "text-gray-300"
                    )}
                  >
                    {p.content || "—"}
                  </p>
                </div>
              )}

              {/* More than one photo — the same marker every gallery uses. */}
              {p.images.length > 1 && (
                <span className="absolute top-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  +{p.images.length - 1}
                </span>
              )}
              {p.isPinned && (
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                  <Pin className="w-2.5 h-2.5" />
                  Pinned
                </span>
              )}

              {/* Counts. Always readable on a photo — a gradient scrim rather
                  than plain text over whatever colour the image happens to be
                  at the bottom edge. */}
              <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/45 to-transparent px-2.5 pb-2 pt-6">
                <div className="flex items-center gap-3 text-[11px] font-semibold text-white">
                  <span className="inline-flex items-center gap-1">
                    <Heart
                      className={cn(
                        "w-3 h-3",
                        p.isLiked ? "fill-rose-400 text-rose-400" : "text-white"
                      )}
                    />
                    {p.likesCount}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" />
                    {p.commentsCount}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-white/70">
                    <Eye className="w-3 h-3" />
                    {p.viewsCount}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Reading a post should not mean leaving the profile. There is no
          permalink page for a post, so the tile opens the whole thing here —
          text, every image, and its numbers. */}
      {open && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-xs text-gray-500">
                {new Date(open.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Close"
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {open.content && (
              <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
                <RenderedContent content={open.content} postId={open.id} />
              </div>
            )}

            {open.images.length > 0 && (
              <div className="mt-3 space-y-2">
                {open.images.map((src, i) => (
                  <div
                    key={i}
                    className="relative w-full overflow-hidden rounded-xl bg-gray-950"
                  >
                    <SmartImage
                      src={src}
                      alt=""
                      width={1200}
                      height={800}
                      className="w-full h-auto object-contain"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-gray-800 flex items-center gap-4 text-xs text-gray-400">
              <span className="inline-flex items-center gap-1.5">
                <Heart
                  className={cn(
                    "w-3.5 h-3.5",
                    open.isLiked ? "fill-rose-400 text-rose-400" : ""
                  )}
                />
                {open.likesCount}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" />
                {open.commentsCount}
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                {open.viewsCount}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
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

/** One labelled fact in the public About card. */
function PublicFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-gray-500 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">
          {label}
        </p>
        <p className="text-sm text-gray-200 break-words">{value}</p>
      </div>
    </div>
  );
}
