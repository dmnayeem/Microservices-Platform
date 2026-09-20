"use client";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { toast } from "@/lib/toast";
import { cn, usd } from "@/lib/utils";
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
import { useCountries } from "@/lib/use-countries";
import { ProfileTabBody } from "./profile-tab-body";
import { PostsListTab } from "./posts-list-tab";
import { UserListTab } from "./user-list-tab";
import { AnalyticsTab } from "./analytics-tab";
import { TagModal } from "./tag-modal";
import { PhotoModal } from "./photo-modal";
import { ConnectSocialModal } from "./connect-social-modal";
import { ScrollFadeRow } from "@/components/user/primitives/scroll-fade-row";

export function ProfileView() {
  // Canonical 196-row country list; the 15-row constant is only the first-paint
  // fallback. A country the platform can be set to must be a country it can name.
  const countryList = useCountries(COUNTRIES.map((c) => ({ ...c, flag: null })));
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
  const router = useRouter();

  const openEdit = (which: EditTab = "personal", field?: string) => {
    setEditTab(which);
    setEditOpen(true);
    setPrimaryTab("profile");
    requestAnimationFrame(() => {
      editAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!field) return;
      // The tab has to render before the field exists. One more frame plus a
      // short delay covers the panel's open transition; if it is still not
      // there we simply leave the user at the top of the right tab, which is
      // where they used to land anyway.
      setTimeout(() => {
        const el = document.getElementById(`pf-${field}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // A ring rather than focus(): focusing a <select> on mobile pops the
        // picker open before the user has seen what they were sent to.
        el.classList.add("pf-highlight");
        setTimeout(() => el.classList.remove("pf-highlight"), 2200);
        const input = el.querySelector<HTMLElement>("input, textarea, select");
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
          input.focus({ preventScroll: true });
        }
      }, 260);
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
        <Loader2 className="w-8 h-8 animate-spin text-(--app-accent-ink)" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-(--app-ink-3)">
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
        <div className="rounded-xl border border-(--app-accent-edge)/40 bg-(--app-cta)/10 p-3 flex items-center gap-3">
          <Globe className="w-4 h-4 text-(--app-accent-ink) shrink-0" />
          <p className="text-sm text-(--app-accent-ink) flex-1">
            We detected you&apos;re in{" "}
            <strong>{countryList.find((c) => c.code === autoCountry.country)?.name ?? autoCountry.country}</strong>.
            Auto-fill your profile?
          </p>
          <button
            onClick={acceptAutoCountry}
            className="px-3 py-1.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-xs font-bold"
          >
            Yes, use it
          </button>
          <button
            onClick={() => setAutoCountry({ ...autoCountry, dismissed: true })}
            className="p-1.5 text-(--app-accent-ink) hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Profile Header */}
      <div className="relative rounded-2xl overflow-hidden glass">
        <div className="relative h-36 sm:h-48 bg-linear-to-br from-(--app-grad-a) via-(--app-rail-b) to-(--app-grad-b)">
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
        <div className="bg-(--app-surface) px-4 sm:px-6 pt-14 sm:pt-16 pb-5 relative">
          <div className="absolute -top-14 sm:-top-16 left-4 sm:left-6">
            <div className="relative">
              <Avatar
                src={profile.avatar}
                size="w-28 h-28 sm:w-32 sm:h-32"
                shape="rounded"
                fallbackText={initial}
                className="border-4 border-(--app-surface) shadow-xl"
              />
              <button
                onClick={() => setPhotoTarget("avatar")}
                className="absolute bottom-1 right-1 p-2 bg-(--app-surface-2) hover:bg-(--app-surface-hover) rounded-full border-2 border-(--app-surface) shadow-lg"
                aria-label="Change profile photo"
              >
                <Camera className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>

          <div className="flex justify-end mb-2 gap-2">
            <Link
              href={profileHref(profile)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-xs font-semibold"
            >
              <EyeIcon className="w-3.5 h-3.5" />
              View as public
            </Link>
            <button
              onClick={() => openEdit("personal")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-xs font-bold shadow-lg shadow-(--app-cta)/30"
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
              <p className="text-(--app-ink-3) text-sm mt-0.5">
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
            <p className="text-sm text-(--app-ink-2) mt-3 whitespace-pre-wrap leading-relaxed">
              {profile.bio}
            </p>
          )}

          <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-(--app-ink-3)">
            {profile.country && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                {countryList.find((c) => c.code === profile.country)?.name ?? profile.country}
              </span>
            )}
            {profile.profession && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                {profile.profession}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-(--app-accent-ink)" />
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
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-(--app-cta)/10 text-(--app-accent-ink) text-[11px] font-medium border border-(--app-accent-edge)/30"
                >
                  <span>{meta?.emoji ?? "★"}</span>
                  {meta?.label ?? t}
                </span>
              );
            })}
            <button
              onClick={() => setTagModalOpen(true)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink-2) text-[11px] font-medium border border-(--app-line)"
            >
              <Tag className="w-3 h-3" />
              {profile.tags.length === 0 ? "Add tags" : "Edit tags"}
            </button>
          </div>

          {/* Inline social stats — compact Facebook-style counter row */}
          <div className="grid grid-cols-3 gap-1 mt-3 pt-3 border-t border-(--app-line)">
            <button
              onClick={() => setPrimaryTab("posts")}
              className="flex items-baseline justify-center gap-1.5 hover:bg-(--app-surface-2)/50 rounded-lg py-1.5 transition-colors"
            >
              <span className="text-base font-bold text-white tabular-nums">
                {stats.postsCount.toLocaleString()}
              </span>
              <span className="text-[11px] text-(--app-ink-3) font-medium">Posts</span>
            </button>
            <button
              onClick={() => setPrimaryTab("followers")}
              className="flex items-baseline justify-center gap-1.5 hover:bg-(--app-surface-2)/50 rounded-lg py-1.5 transition-colors border-x border-(--app-line)"
            >
              <span className="text-base font-bold text-white tabular-nums">
                {stats.followersCount.toLocaleString()}
              </span>
              <span className="text-[11px] text-(--app-ink-3) font-medium">Followers</span>
            </button>
            <button
              onClick={() => setPrimaryTab("following")}
              className="flex items-baseline justify-center gap-1.5 hover:bg-(--app-surface-2)/50 rounded-lg py-1.5 transition-colors"
            >
              <span className="text-base font-bold text-white tabular-nums">
                {stats.followingCount.toLocaleString()}
              </span>
              <span className="text-[11px] text-(--app-ink-3) font-medium">Following</span>
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
              <p className="text-xs text-(--app-ink-3) -mt-0.5">From posts &amp; engagement</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-extrabold text-white tabular-nums leading-tight">
                {stats.socialEarningsPoints.toLocaleString()}{" "}
                <span className="text-[11px] font-semibold text-(--app-ink-3)">pts</span>
              </p>
              <p className="text-[11px] text-(--app-ink-3) tabular-nums leading-tight">
                ≈ {usd(stats.socialEarningsUsd)}
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Lifetime stats — moved to top per user request */}
      <LifetimeStatsGroup stats={stats.lifetime} />

      {/* Sticky Facebook-style primary tabs */}
      <nav className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 glass-strong rounded-none border-0 border-y border-(--app-line)/60">
        <ScrollFadeRow innerClassName="flex gap-1 py-1" ariaLabel="Profile tabs">
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
                "shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors relative",
                primaryTab === t.key
                  ? "text-(--app-accent-ink)"
                  : "text-(--app-ink-3) hover:text-white"
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {primaryTab === t.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-(--app-cta) rounded-full" />
              )}
            </button>
          ))}
        </ScrollFadeRow>
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
            // Each item now says where it is genuinely edited, which is not
            // always a tab: the photos and the tags live in modals on this
            // page, and email/phone verification lives on its own route. The
            // old handler read only `?tab=` and sent everything to the personal
            // form — so "Profile photo" opened a form with no photo control.
            if (href.startsWith("/")) {
              router.push(href);
              return;
            }
            const params = new URLSearchParams(href.replace(/^\?/, ""));
            const modal = params.get("modal");
            if (modal === "photo") {
              setPhotoTarget(
                params.get("which") === "coverPhoto" ? "coverPhoto" : "avatar"
              );
              return;
            }
            if (modal === "tags") {
              setTagModalOpen(true);
              return;
            }
            const t = params.get("tab") as EditTab | null;
            openEdit(t ?? "personal", params.get("field") ?? undefined);
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
