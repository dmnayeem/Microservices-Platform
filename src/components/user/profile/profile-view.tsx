"use client";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { confirmDialog } from "@/lib/confirm";
import { profileHref } from "@/lib/user-href";
import {
  User,
  MapPin,
  Calendar,
  Camera,
  X,
  Loader2,
  Globe,
  Edit3,
  Users,
  Tag,
  Image as ImageIcon,
  Eye as EyeIcon,
  BarChart3,
  UserPlus,
  Coins,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LifetimeStatsGroup } from "@/components/user/profile/profile-stat-groups";
import { useTheme, type Accent } from "@/components/providers/theme-provider";
import {
  PackageBadge,
  LevelBadge,
  RankBadge,
} from "@/components/user/profile/badges";
import { VerifiedBadge } from "@/components/user/profile/verified-badge";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { Avatar } from "@/components/user/primitives/avatar";
import type {
  ProfileResponse,
  SocialAccount,
  PrimaryTab,
  EditTab,
} from "./profile-view.types";
import { COUNTRIES, TAG_OPTIONS } from "./profile-view.constants";
import { ProfileTabBody } from "./profile-tab-body";
import { PostsListTab } from "./posts-list-tab";
import { UserListTab } from "./user-list-tab";
import { AnalyticsTab } from "./analytics-tab";
import { TagModal } from "./tag-modal";
import { PhotoModal } from "./photo-modal";
import { ConnectSocialModal } from "./connect-social-modal";

export function ProfileView() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>("profile");
  const [editOpen, setEditOpen] = useState(false);
  const [editTab, setEditTab] = useState<EditTab>("personal");
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<"avatar" | "coverPhoto" | null>(null);
  const [connectPlatform, setConnectPlatform] = useState<SocialAccount["platform"] | null>(null);
  const [autoCountry, setAutoCountry] = useState<{
    country: string | null;
    timezone: string | null;
    dismissed: boolean;
  } | null>(null);
  const editAnchorRef = useRef<HTMLDivElement | null>(null);

  const openEdit = (which: EditTab = "personal") => {
    setEditTab(which);
    setEditOpen(true);
    setPrimaryTab("profile");
    requestAnimationFrame(() => {
      editAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error(await res.text());
      setData((await res.json()) as ProfileResponse);
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
  }, []);

  // Sync live theme + accent with the user's saved preference on load. The
  // provider now handles "system" (OS-reactive) natively, so pass it raw.
  const { setTheme, setAccent } = useTheme();
  useEffect(() => {
    const saved = data?.preferences?.theme;
    if (saved === "dark" || saved === "light" || saved === "system") {
      setTheme(saved);
    }
    const savedAccent = data?.preferences?.themeAccent;
    if (savedAccent) setAccent(savedAccent as Accent);
  }, [
    data?.preferences?.theme,
    data?.preferences?.themeAccent,
    setTheme,
    setAccent,
  ]);

  // Auto-country detection — only fires when country is missing
  useEffect(() => {
    if (!data || data.profile.country || autoCountry) return;
    fetch("/api/profile/auto-detect")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.country || d?.timezone) {
          setAutoCountry({ country: d.country, timezone: d.timezone, dismissed: false });
        }
      })
      .catch(() => {});
  }, [data, autoCountry]);

  const acceptAutoCountry = async () => {
    if (!autoCountry?.country) return;
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: autoCountry.country,
          ...(autoCountry.timezone ? { timezone: autoCountry.timezone } : {}),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Country set to ${autoCountry.country}`);
      setAutoCountry({ ...autoCountry, dismissed: true });
      load();
    } catch (err) {
      toast.error("Couldn't apply", {
        description: err instanceof Error ? err.message : "Try again",
      });
    }
  };

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Saved");
      load();
      return true;
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
      return false;
    }
  };

  const disconnectSocial = async (id: string) => {
    if (!(await confirmDialog({ title: "Disconnect this account?", tone: "danger", confirmLabel: "Disconnect" }))) return;
    try {
      const res = await fetch(`/api/profile/social-accounts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Disconnected");
      load();
    } catch (err) {
      toast.error("Couldn't disconnect", {
        description: err instanceof Error ? err.message : "Try again",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Couldn&apos;t load your profile. Try refreshing.
      </div>
    );
  }

  const { profile, stats, verification, socialAccounts } = data;
  const displayName = profile.name ?? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() ?? "User";
  const initial = (displayName || profile.email).charAt(0).toUpperCase();

  return (
    <div className="space-y-5 pb-12">
      {/* Auto-country banner */}
      {autoCountry?.country && !autoCountry.dismissed && !profile.country && (
        <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3 flex items-center gap-3">
          <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
          <p className="text-sm text-indigo-200 flex-1">
            We detected you&apos;re in{" "}
            <strong>{COUNTRIES.find((c) => c.code === autoCountry.country)?.name ?? autoCountry.country}</strong>.
            Auto-fill your profile?
          </p>
          <button
            onClick={acceptAutoCountry}
            className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold"
          >
            Yes, use it
          </button>
          <button
            onClick={() => setAutoCountry({ ...autoCountry, dismissed: true })}
            className="p-1.5 text-indigo-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Profile Header */}
      <div className="relative rounded-2xl overflow-hidden glass">
        <div className="relative h-36 sm:h-48 bg-linear-to-br from-indigo-600 via-purple-600 to-pink-600">
          {profile.coverPhoto && (
            <SmartImage
              src={profile.coverPhoto}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
            />
          )}
          <button
            onClick={() => setPhotoTarget("coverPhoto")}
            className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/55 backdrop-blur-md text-white text-xs font-medium hover:bg-black/75 border border-white/10"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Edit Cover</span>
            <span className="xs:hidden">Cover</span>
          </button>
        </div>
        <div className="bg-gray-900 px-4 sm:px-6 pt-14 sm:pt-16 pb-5 relative">
          <div className="absolute -top-14 sm:-top-16 left-4 sm:left-6">
            <div className="relative">
              <Avatar
                src={profile.avatar}
                size="w-28 h-28 sm:w-32 sm:h-32"
                shape="rounded"
                fallbackText={initial}
                className="border-4 border-gray-900 shadow-xl"
              />
              <button
                onClick={() => setPhotoTarget("avatar")}
                className="absolute bottom-1 right-1 p-2 bg-gray-800 hover:bg-gray-700 rounded-full border-2 border-gray-900 shadow-lg"
                aria-label="Change profile photo"
              >
                <Camera className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>

          <div className="flex justify-end mb-2 gap-2">
            <Link
              href={profileHref(profile)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold"
            >
              <EyeIcon className="w-3.5 h-3.5" />
              View as public
            </Link>
            <button
              onClick={() => openEdit("personal")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-900/30"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Profile
            </button>
          </div>

          <div className="flex items-start gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">
                  {displayName}
                </h1>
                {verification.isBlueVerified && (
                  <VerifiedBadge
                    style={verification.verifiedBadgeStyle}
                    size="md"
                  />
                )}
              </div>
              <p className="text-gray-500 text-sm mt-0.5">
                @{profile.username ?? profile.email?.split("@")[0] ?? "user"}
              </p>
            </div>
          </div>

          {/* Prominent package + level pills */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <PackageBadge tier={data.package.tier} name={data.package.name} href="/packages" />
            <LevelBadge level={stats.level} xp={stats.xp} xpNeeded={stats.xpNeeded} xpProgress={stats.xpProgress} xpPercentage={stats.xpPercentage} />
            <RankBadge rank={stats.lifetime.rank} />
          </div>

          {profile.bio && (
            <p className="text-sm text-gray-300 mt-3 whitespace-pre-wrap leading-relaxed">
              {profile.bio}
            </p>
          )}

          <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-gray-400">
            {profile.country && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                {COUNTRIES.find((c) => c.code === profile.country)?.name ?? profile.country}
              </span>
            )}
            {profile.profession && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                {profile.profession}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Joined{" "}
              {new Date(profile.createdAt).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {profile.tags.map((t) => {
              const meta = TAG_OPTIONS.find((o) => o.id === t);
              return (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-[11px] font-medium border border-indigo-500/30"
                >
                  <span>{meta?.emoji ?? "★"}</span>
                  {meta?.label ?? t}
                </span>
              );
            })}
            <button
              onClick={() => setTagModalOpen(true)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-medium border border-gray-700"
            >
              <Tag className="w-3 h-3" />
              {profile.tags.length === 0 ? "Add tags" : "Edit tags"}
            </button>
          </div>

          {/* Inline social stats — compact Facebook-style counter row */}
          <div className="grid grid-cols-3 gap-1 mt-3 pt-3 border-t border-gray-800">
            <button
              onClick={() => setPrimaryTab("posts")}
              className="flex items-baseline justify-center gap-1.5 hover:bg-gray-800/50 rounded-lg py-1.5 transition-colors"
            >
              <span className="text-base font-bold text-white tabular-nums">
                {stats.postsCount.toLocaleString()}
              </span>
              <span className="text-[11px] text-gray-400 font-medium">Posts</span>
            </button>
            <button
              onClick={() => setPrimaryTab("followers")}
              className="flex items-baseline justify-center gap-1.5 hover:bg-gray-800/50 rounded-lg py-1.5 transition-colors border-x border-gray-800"
            >
              <span className="text-base font-bold text-white tabular-nums">
                {stats.followersCount.toLocaleString()}
              </span>
              <span className="text-[11px] text-gray-400 font-medium">Followers</span>
            </button>
            <button
              onClick={() => setPrimaryTab("following")}
              className="flex items-baseline justify-center gap-1.5 hover:bg-gray-800/50 rounded-lg py-1.5 transition-colors"
            >
              <span className="text-base font-bold text-white tabular-nums">
                {stats.followingCount.toLocaleString()}
              </span>
              <span className="text-[11px] text-gray-400 font-medium">Following</span>
            </button>
          </div>

          {/* Social earnings highlight — points earned from posts & engagement */}
          <button
            onClick={() => setPrimaryTab("analytics")}
            className="w-full mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/15 transition-colors text-left"
          >
            <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 shrink-0">
              <Coins className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider font-bold text-amber-400/90">
                Social Earnings
              </p>
              <p className="text-xs text-gray-400 -mt-0.5">From posts &amp; engagement</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-extrabold text-white tabular-nums leading-tight">
                {stats.socialEarningsPoints.toLocaleString()}{" "}
                <span className="text-[11px] font-semibold text-gray-400">pts</span>
              </p>
              <p className="text-[11px] text-gray-500 tabular-nums leading-tight">
                ≈ ${stats.socialEarningsUsd.toFixed(2)}
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Lifetime stats — moved to top per user request */}
      <LifetimeStatsGroup stats={stats.lifetime} />

      {/* Sticky Facebook-style primary tabs */}
      <nav className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 glass-strong rounded-none border-0 border-y border-gray-800/60">
        <div className="flex gap-1 overflow-x-auto scrollbar-thin py-1">
          {(
            [
              { key: "profile", label: "Profile", icon: User },
              { key: "posts", label: "Posts", icon: ImageIcon },
              { key: "followers", label: "Followers", icon: Users },
              { key: "following", label: "Following", icon: UserPlus },
              { key: "analytics", label: "Analytics", icon: BarChart3 },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setPrimaryTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors relative",
                primaryTab === t.key
                  ? "text-indigo-400"
                  : "text-gray-400 hover:text-white"
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {primaryTab === t.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Tab content */}
      {primaryTab === "profile" && (
        <ProfileTabBody
          data={data}
          patch={patch}
          editAnchorRef={editAnchorRef}
          editOpen={editOpen}
          setEditOpen={setEditOpen}
          editTab={editTab}
          setEditTab={setEditTab}
          openEdit={openEdit}
          onJumpCompletion={(href) => {
            if (!href) return;
            const params = new URLSearchParams(href.replace(/^\?/, ""));
            const t = params.get("tab") as EditTab | null;
            openEdit(t ?? "personal");
          }}
          onConnectSocial={(p) => setConnectPlatform(p)}
          onDisconnectSocial={disconnectSocial}
        />
      )}
      {primaryTab === "posts" && <PostsListTab userId={profile.id} />}
      {primaryTab === "followers" && (
        <UserListTab endpoint={`/api/users/${profile.id}/followers`} viewerId={profile.id} />
      )}
      {primaryTab === "following" && (
        <UserListTab endpoint={`/api/users/${profile.id}/following`} viewerId={profile.id} />
      )}
      {primaryTab === "analytics" && <AnalyticsTab />}

      {/* Modals */}
      {tagModalOpen && (
        <TagModal
          selected={profile.tags}
          onClose={() => setTagModalOpen(false)}
          onSave={async (tags) => {
            const ok = await patch({ tags });
            if (ok) setTagModalOpen(false);
          }}
        />
      )}

      {photoTarget && (
        <PhotoModal
          target={photoTarget}
          currentUrl={photoTarget === "avatar" ? profile.avatar : profile.coverPhoto}
          onClose={() => setPhotoTarget(null)}
          onSaved={() => {
            setPhotoTarget(null);
            load();
          }}
        />
      )}

      {connectPlatform && (
        <ConnectSocialModal
          platform={connectPlatform}
          existing={socialAccounts.find((a) => a.platform === connectPlatform)}
          onClose={() => setConnectPlatform(null)}
          onSaved={() => {
            setConnectPlatform(null);
            load();
          }}
        />
      )}

      <AdRenderer placement="PROFILE_BOTTOM" />
    </div>
  );
}
