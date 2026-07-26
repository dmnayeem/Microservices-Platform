"use client";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { confirmDialog } from "@/lib/confirm";
import { profileHref } from "@/lib/user-href";
import { USERNAME_REGEX } from "@/lib/username";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  Camera,
  X,
  Loader2,
  Globe,
  CheckCircle,
  CheckCircle2,
  Circle,
  Edit3,
  Sparkles,
  Users,
  Tag,
  Plus,
  Trash2,
  ChevronRight,
  Twitter,
  Facebook,
  Instagram,
  Youtube,
  Linkedin,
  Send,
  MessageCircle,
  Music2,
  Lock,
  Palette,
  CreditCard,
  Bell,
  Upload,
  Briefcase,
  Languages,
  Image as ImageIcon,
  ThumbsUp,
  MessageSquare,
  Share2,
  Eye as EyeIcon,
  BarChart3,
  UserPlus,
  UserCheck,
  Coins,
  Droplet,
  GraduationCap,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LifetimeStatsGroup } from "@/components/user/profile/profile-stat-groups";
import { LocationSelector } from "@/components/shared/location-selector";
import {
  useTheme,
  ACCENTS,
  ACCENT_HEX,
  ACCENT_GRADIENT,
  type Theme,
  type Accent,
} from "@/components/providers/theme-provider";
import {
  PackageBadge,
  LevelBadge,
  RankBadge,
} from "@/components/user/profile/badges";
import {
  AnalyticsPanel,
  type AnalyticsResp,
} from "@/components/user/profile/analytics-panel";
import { VerifiedBadge } from "@/components/user/profile/verified-badge";
import { BecomeTutorCard } from "@/components/user/profile/become-tutor-card";
import { SmartImage } from "@/components/user/primitives/smart-image";

interface CompletionItem {
  key: string;
  label: string;
  category: "basic" | "contact" | "address" | "verification" | "social";
  done: boolean;
  weight: number;
  href?: string;
}

interface SocialAccount {
  id: string;
  platform:
    | "TWITTER"
    | "FACEBOOK"
    | "INSTAGRAM"
    | "YOUTUBE"
    | "TIKTOK"
    | "LINKEDIN"
    | "TELEGRAM"
    | "DISCORD";
  username: string;
  url: string | null;
  followers: number;
  following: number;
  postsCount: number;
  verified: boolean;
  connectedAt: string;
}

interface ProfileResponse {
  profile: {
    id: string;
    name: string | null;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatar: string | null;
    coverPhoto: string | null;
    bio: string | null;
    phone: string | null;
    secondaryEmail: string | null;
    secondaryPhone: string | null;
    gender: string | null;
    dateOfBirth: string | null;
    nidNumber: string | null;
    profession: string | null;
    nationality: string | null;
    bloodGroup: string | null;
    country: string | null;
    language: string;
    timezone: string;
    tags: string[];
    createdAt: string;
  };
  address: {
    street: string | null;
    village: string | null;
    city: string | null;
    subDistrict: string | null;
    district: string | null;
    subDivision: string | null;
    division: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
  };
  stats: {
    level: number;
    xp: number;
    xpProgress: number;
    xpNeeded: number;
    xpPercentage: number;
    pointsBalance: number;
    cashBalance: number;
    totalEarnings: number;
    tasksCompleted: number;
    referralsCount: number;
    achievementsCount: number;
    socialAccountsCount: number;
    postsCount: number;
    followersCount: number;
    followingCount: number;
    coursesEnrolled: number;
    coursesCreated: number;
    marketplaceListings: number;
    marketplacePurchases: number;
    marketplaceSales: number;
    marketplaceSalesAmount: number;
    socialEarningsPoints: number;
    socialEarningsUsd: number;
    lifetime: {
      totalEarnedPoints: number | null;
      totalEarnedUsd: number | null;
      tasksCompleted: number;
      rank: number;
      totalXp: number;
      level: number;
      team: number;
    };
  };
  package: {
    tier: string;
    name: string;
  };
  referral: {
    code: string;
    link: string;
  };
  verification: {
    kycStatus: string;
    isBlueVerified: boolean;
    verifiedBadgeStyle: string | null;
    isEmailVerified: boolean;
    isPhoneVerified: boolean;
    twoFactorEnabled: boolean;
    isFullyVerified: boolean;
  };
  preferences: {
    theme: string;
    themeAccent: string;
    notifications: { enabled: boolean; email: boolean; push: boolean };
    privacy: { avatar: string; bio: string; stats: string; earnings: string; location: string };
  };
  socialAccounts: SocialAccount[];
  completion: {
    percentage: number;
    items: CompletionItem[];
    missing: CompletionItem[];
  };
}

const COUNTRIES = [
  { code: "BD", name: "Bangladesh" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "US", name: "United States" },
  { code: "UK", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "AE", name: "UAE" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "MY", name: "Malaysia" },
  { code: "SG", name: "Singapore" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "NG", name: "Nigeria" },
  { code: "EG", name: "Egypt" },
];

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "bn", name: "Bengali" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "zh", name: "Chinese" },
];

const TAG_OPTIONS: { id: string; label: string; emoji: string }[] = [
  { id: "EARLY_ADOPTER", label: "Early Adopter", emoji: "🚀" },
  { id: "VERIFIED", label: "Verified", emoji: "✓" },
  { id: "CRYPTO", label: "Crypto", emoji: "₿" },
  { id: "TRADER", label: "Trader", emoji: "📈" },
  { id: "GAMER", label: "Gamer", emoji: "🎮" },
  { id: "INFLUENCER", label: "Influencer", emoji: "📣" },
  { id: "WHALE", label: "Whale", emoji: "🐋" },
  { id: "PRO", label: "Pro", emoji: "🏆" },
  { id: "ELITE", label: "Elite", emoji: "💎" },
  { id: "CREATOR", label: "Creator", emoji: "🎨" },
];

const PLATFORM_META: Record<
  SocialAccount["platform"],
  { label: string; icon: typeof Twitter; gradient: string; countLabel: string }
> = {
  TWITTER: { label: "Twitter / X", icon: Twitter, gradient: "from-sky-500 to-blue-600", countLabel: "Followers" },
  FACEBOOK: { label: "Facebook", icon: Facebook, gradient: "from-blue-500 to-indigo-600", countLabel: "Followers" },
  INSTAGRAM: { label: "Instagram", icon: Instagram, gradient: "from-pink-500 to-purple-600", countLabel: "Followers" },
  YOUTUBE: { label: "YouTube", icon: Youtube, gradient: "from-red-500 to-rose-600", countLabel: "Subscribers" },
  TIKTOK: { label: "TikTok", icon: Music2, gradient: "from-fuchsia-500 to-rose-500", countLabel: "Followers" },
  LINKEDIN: { label: "LinkedIn", icon: Linkedin, gradient: "from-cyan-600 to-blue-700", countLabel: "Connections" },
  TELEGRAM: { label: "Telegram", icon: Send, gradient: "from-sky-400 to-blue-500", countLabel: "Subscribers" },
  DISCORD: { label: "Discord", icon: MessageCircle, gradient: "from-indigo-500 to-violet-600", countLabel: "Server members" },
};

type PrimaryTab = "profile" | "posts" | "followers" | "following" | "analytics";
type EditTab = "personal" | "address" | "kyc" | "social" | "privacy" | "theme" | "security";

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
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600 border-4 border-gray-900 flex items-center justify-center text-white text-4xl font-extrabold overflow-hidden shadow-xl">
                {profile.avatar ? (
                  <SmartImage src={profile.avatar} alt="" fill sizes="112px" className="object-cover" />
                ) : (
                  initial
                )}
              </div>
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

// ───────────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────────────

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "indigo" | "amber" | "emerald" | "purple";
}) {
  const tones = {
    indigo: "text-indigo-400 bg-indigo-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    emerald: "text-emerald-400 bg-emerald-500/10",
    purple: "text-purple-400 bg-purple-500/10",
  } as const;
  return (
    <div className="glass p-3 flex items-center gap-3">
      <div className={cn("p-2 rounded-lg", tones[tone])}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-base font-bold text-white tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function PersonalTab({
  data,
  patch,
}: {
  data: ProfileResponse;
  patch: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { profile } = data;
  const [form, setForm] = useState({
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    username: profile.username ?? "",
    bio: profile.bio ?? "",
    gender: profile.gender ?? "",
    dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : "",
    nidNumber: profile.nidNumber ?? "",
    profession: profile.profession ?? "",
    nationality: profile.nationality ?? "",
    bloodGroup: profile.bloodGroup ?? "",
    phone: profile.phone ?? "",
    secondaryEmail: profile.secondaryEmail ?? "",
    secondaryPhone: profile.secondaryPhone ?? "",
    language: profile.language,
    timezone: profile.timezone,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await patch({
      firstName: form.firstName || null,
      lastName: form.lastName || null,
      username: form.username || null,
      bio: form.bio || null,
      gender: form.gender || null,
      dateOfBirth: form.dateOfBirth || null,
      nidNumber: form.nidNumber || null,
      profession: form.profession || null,
      nationality: form.nationality || null,
      bloodGroup: form.bloodGroup || null,
      phone: form.phone || null,
      secondaryEmail: form.secondaryEmail || null,
      secondaryPhone: form.secondaryPhone || null,
      language: form.language,
      timezone: form.timezone,
    });
    setBusy(false);
  };

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <Card title="Personal Info">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="First Name">
          <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inp} />
        </Field>
        <Field label="Last Name">
          <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inp} />
        </Field>
        <UsernameField
          value={form.username}
          onChange={(v) => set("username", v)}
          currentUsername={profile.username ?? null}
        />
        <Field label="Date of Birth">
          <input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} className={inp} />
        </Field>
        <Field label="Gender">
          <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className={inp}>
            <option value="">—</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="National ID / Passport">
          <input value={form.nidNumber} onChange={(e) => set("nidNumber", e.target.value)} className={inp} />
        </Field>
        <Field label="Profession">
          <input value={form.profession} onChange={(e) => set("profession", e.target.value)} className={inp} />
        </Field>
        <Field label="Nationality">
          <input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} className={inp} />
        </Field>
        <Field label="Blood Group">
          <select value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)} className={inp}>
            <option value="">—</option>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="Language">
          <select value={form.language} onChange={(e) => set("language", e.target.value)} className={inp}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Phone">
          <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+880 1234 567890" className={inp} />
        </Field>
        <Field label="Secondary Phone">
          <input type="tel" value={form.secondaryPhone} onChange={(e) => set("secondaryPhone", e.target.value)} className={inp} />
        </Field>
        <Field label="Secondary Email">
          <input type="email" value={form.secondaryEmail} onChange={(e) => set("secondaryEmail", e.target.value)} className={inp} />
        </Field>
        <Field label="Timezone">
          <input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="Asia/Dhaka" className={inp} />
        </Field>
      </div>
      <Field label="Bio (about you)">
        <textarea
          rows={3}
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          maxLength={500}
          placeholder="A short intro that appears on your public profile."
          className={inp}
        />
      </Field>
      <div className="flex justify-end pt-2">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Changes
        </button>
      </div>
    </Card>
  );
}

function AddressTab({
  data,
  patch,
}: {
  data: ProfileResponse;
  patch: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { address } = data;
  const [form, setForm] = useState({
    street: address.street ?? "",
    village: address.village ?? "",
    city: address.city ?? "",
    subDistrict: address.subDistrict ?? "",
    district: address.district ?? "",
    subDivision: "",
    division: address.division ?? "",
    region: address.region ?? "",
    postalCode: address.postalCode ?? "",
    country: address.country ?? "",
  });
  const [busy, setBusy] = useState(false);

  return (
    <Card title="Address">
      <LocationSelector
        value={{
          country: form.country,
          region: form.region,
          division: form.division,
          subDivision: form.subDivision,
          district: form.district,
          subDistrict: form.subDistrict,
          city: form.city,
          village: form.village,
          street: form.street,
          postalCode: form.postalCode,
        }}
        onChange={(p) =>
          setForm((prev) => ({
            ...prev,
            ...Object.fromEntries(
              Object.entries(p).map(([k, v]) => [k, v ?? ""])
            ),
          }))
        }
      />
      <div className="flex justify-end pt-3">
        <button
          onClick={async () => {
            setBusy(true);
            const { subDivision: _sub, ...payload } = form;
            void _sub;
            await patch(payload);
            setBusy(false);
          }}
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Address
        </button>
      </div>
    </Card>
  );
}

function KycTab({ data }: { data: ProfileResponse }) {
  const { verification } = data;
  return (
    <Card title="KYC Verification">
      <div className="rounded-lg p-3 border border-gray-800 bg-gray-950 mb-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold">Status</p>
        <p
          className={cn(
            "text-base font-bold mt-0.5",
            verification.kycStatus === "APPROVED" && "text-emerald-400",
            verification.kycStatus === "PENDING" && "text-amber-400",
            verification.kycStatus === "REJECTED" && "text-red-400",
            (!verification.kycStatus || verification.kycStatus === "NOT_SUBMITTED") && "text-gray-300"
          )}
        >
          {verification.kycStatus === "APPROVED"
            ? "✅ Approved — Blue verified"
            : verification.kycStatus === "PENDING"
            ? "⏱ Pending review"
            : verification.kycStatus === "REJECTED"
            ? "❌ Rejected"
            : "Not submitted"}
        </p>
      </div>

      <p className="text-sm text-gray-400 mb-4">
        Submit a government-issued ID (front + back) and a selfie to verify your identity.
        Approved KYC unlocks higher withdrawal limits and the blue 🔵 badge.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/kyc"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold"
        >
          <Shield className="w-4 h-4" />
          {verification.kycStatus === "NOT_SUBMITTED" || !verification.kycStatus
            ? "Submit KYC"
            : "Manage KYC"}
        </Link>
        {verification.kycStatus === "REJECTED" && (
          <Link
            href="/kyc/appeal"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-sm font-bold border border-amber-500/30"
          >
            Appeal Rejection →
          </Link>
        )}
      </div>
    </Card>
  );
}

function SocialTab({
  accounts,
  onConnect,
  onDisconnect,
}: {
  accounts: SocialAccount[];
  onConnect: (p: SocialAccount["platform"]) => void;
  onDisconnect: (id: string) => void;
}) {
  const totalFollowers = useMemo(
    () => accounts.reduce((s, a) => s + a.followers, 0),
    [accounts]
  );
  const totalPosts = useMemo(
    () => accounts.reduce((s, a) => s + a.postsCount, 0),
    [accounts]
  );

  return (
    <div className="space-y-4">
      {accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatTile icon={<Users className="w-4 h-4" />} label="Total followers" value={totalFollowers.toLocaleString()} tone="indigo" />
          <StatTile icon={<Twitter className="w-4 h-4" />} label="Connected" value={`${accounts.length} / 8`} tone="purple" />
          <StatTile icon={<Sparkles className="w-4 h-4" />} label="Total posts" value={totalPosts.toLocaleString()} tone="amber" />
        </div>
      )}

      <Card title="Connected Accounts">
        <p className="text-xs text-gray-400 mb-3">
          Connect your social profiles to show your reach. Follower counts are user-entered for now;
          admin can verify them to lock the badge.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(PLATFORM_META) as SocialAccount["platform"][]).map((platform) => {
            const meta = PLATFORM_META[platform];
            const account = accounts.find((a) => a.platform === platform);
            return (
              <div
                key={platform}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  account
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-gray-800 bg-gray-900"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0 bg-linear-to-br",
                      meta.gradient
                    )}
                  >
                    <meta.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white inline-flex items-center gap-1.5">
                      {meta.label}
                      {account?.verified && (
                        <CheckCircle className="w-3.5 h-3.5 text-blue-400 fill-blue-500/30" />
                      )}
                    </p>
                    {account ? (
                      <p className="text-[11px] text-gray-400">@{account.username}</p>
                    ) : (
                      <p className="text-[11px] text-gray-500">Not connected</p>
                    )}
                  </div>
                  {account ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onConnect(platform)}
                        className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDisconnect(account.id)}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"
                        title="Disconnect"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onConnect(platform)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold"
                    >
                      <Plus className="w-3 h-3" />
                      Connect
                    </button>
                  )}
                </div>
                {account && (
                  <div className="grid grid-cols-3 gap-1 mt-3 text-center text-[11px]">
                    <div className="rounded bg-gray-950 py-1.5">
                      <p className="text-white font-bold tabular-nums">
                        {account.followers.toLocaleString()}
                      </p>
                      <p className="text-gray-500">{meta.countLabel}</p>
                    </div>
                    <div className="rounded bg-gray-950 py-1.5">
                      <p className="text-white font-bold tabular-nums">
                        {account.following.toLocaleString()}
                      </p>
                      <p className="text-gray-500">Following</p>
                    </div>
                    <div className="rounded bg-gray-950 py-1.5">
                      <p className="text-white font-bold tabular-nums">
                        {account.postsCount.toLocaleString()}
                      </p>
                      <p className="text-gray-500">Posts</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function PrivacyTab({
  privacy,
  patch,
}: {
  privacy: { avatar: string; bio: string; stats: string; earnings: string; location: string };
  patch: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const fields: { key: keyof typeof privacy; label: string; hint: string }[] = [
    { key: "avatar", label: "Profile photo", hint: "Who can see your avatar" },
    { key: "bio", label: "Bio", hint: "Who can see your about-me" },
    { key: "stats", label: "Stats", hint: "Level, points balance, total earnings" },
    { key: "earnings", label: "Earnings", hint: "Lifetime earnings detail" },
    { key: "location", label: "Location", hint: "City / country shown on profile" },
  ];

  return (
    <Card title="Privacy Settings">
      <div className="space-y-2">
        {fields.map((f) => (
          <div
            key={f.key}
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">{f.label}</p>
              <p className="text-xs text-gray-500">{f.hint}</p>
            </div>
            <select
              value={privacy[f.key]}
              onChange={(e) => patch({ [`privacy${f.key.charAt(0).toUpperCase()}${f.key.slice(1)}`]: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="PUBLIC">Public</option>
              <option value="FRIENDS">Friends</option>
              <option value="PRIVATE">Private</option>
            </select>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-800">
        <a
          href="/api/profile/export"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
        >
          ⬇️ Download My Data
        </a>
        <button
          onClick={() => toast.info("Account deletion request goes to support — open a ticket from /help.")}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-semibold border border-red-500/30"
        >
          🗑 Delete Account
        </button>
      </div>
    </Card>
  );
}

function ThemeTab({
  preferences,
  patch,
}: {
  preferences: { theme: string; themeAccent: string; notifications: { enabled: boolean; email: boolean; push: boolean } };
  patch: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { setTheme, setAccent } = useTheme();

  const applyTheme = (mode: Theme) => {
    setTheme(mode); // provider resolves "system" (OS-reactive) + persists
    patch({ theme: mode });
  };

  const applyAccent = (id: Accent) => {
    setAccent(id);
    patch({ themeAccent: id });
  };

  return (
    <div className="space-y-4">
      <Card title="Appearance">
        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-2">Mode</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: "dark", label: "Dark", style: { backgroundColor: "#0f172a" } },
              { id: "light", label: "Light", style: { backgroundColor: "#f1f5f9" } },
              {
                id: "system",
                label: "System",
                style: { backgroundImage: "linear-gradient(135deg,#f1f5f9 50%,#0f172a 50%)" },
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => applyTheme(t.id)}
              className={cn(
                "p-3 rounded-lg border text-sm font-semibold transition-colors flex flex-col items-center gap-2",
                preferences.theme === t.id
                  ? "bg-indigo-500/15 text-white border-indigo-500/50 ring-1 ring-indigo-500/40"
                  : "bg-gray-900 text-gray-300 border-gray-800 hover:border-gray-700"
              )}
            >
              <span
                className="w-10 h-10 rounded-lg border border-white/10 shadow-inner"
                style={t.style}
              />
              {t.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mt-4 mb-2">Accent Color</p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((id) => (
            <button
              key={id}
              onClick={() => applyAccent(id)}
              style={{ background: ACCENT_GRADIENT[id] ?? ACCENT_HEX[id] }}
              className={cn(
                "w-9 h-9 rounded-full ring-2 ring-offset-2 ring-offset-gray-900 transition-all capitalize",
                preferences.themeAccent === id ? "ring-white" : "ring-transparent"
              )}
              title={id}
            />
          ))}
        </div>
      </Card>

      <Card title="Notifications">
        <Toggle
          label="All notifications"
          hint="Master switch — turning this off silences everything"
          checked={preferences.notifications.enabled}
          onChange={(v) => patch({ notificationsEnabled: v })}
        />
        <Toggle
          label="Email"
          hint="Important account updates by email"
          checked={preferences.notifications.email}
          onChange={(v) => patch({ emailNotifications: v })}
        />
        <Toggle
          label="Push"
          hint="In-app + browser push when available"
          checked={preferences.notifications.push}
          onChange={(v) => patch({ pushNotifications: v })}
        />
      </Card>
    </div>
  );
}

function SecurityTab({
  verification,
}: {
  verification: { twoFactorEnabled: boolean; isEmailVerified: boolean };
}) {
  return (
    <Card title="Security & Password">
      <div className="space-y-3">
        <Link
          href="/update-password"
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 transition-colors"
        >
          <Lock className="w-4 h-4 text-indigo-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">Change Password</p>
            <p className="text-xs text-gray-500">Use a strong password unique to this account</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </Link>

        <Link
          href="/2fa-setup"
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 transition-colors"
        >
          <Shield className="w-4 h-4 text-emerald-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">Two-Factor Authentication</p>
            <p className="text-xs text-gray-500">
              {verification.twoFactorEnabled ? "Enabled — manage backup codes" : "Add an extra layer with TOTP"}
            </p>
          </div>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded",
              verification.twoFactorEnabled ? "bg-emerald-500/15 text-emerald-400" : "bg-gray-800 text-gray-400"
            )}
          >
            {verification.twoFactorEnabled ? "On" : "Off"}
          </span>
        </Link>

        <Link
          href="/payment-methods"
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 transition-colors"
        >
          <CreditCard className="w-4 h-4 text-amber-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">Payment Methods</p>
            <p className="text-xs text-gray-500">Manage payout destinations</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </Link>

        <Link
          href="/notifications"
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 transition-colors"
        >
          <Bell className="w-4 h-4 text-purple-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">Notifications inbox</p>
            <p className="text-xs text-gray-500">View account & system messages</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </Link>
      </div>
    </Card>
  );
}

// ───────────────────────────── Profile Tab Body ─────────────────────────────

function ProfileTabBody({
  data,
  patch,
  editAnchorRef,
  editOpen,
  setEditOpen,
  editTab,
  setEditTab,
  openEdit,
  onJumpCompletion,
  onConnectSocial,
  onDisconnectSocial,
}: {
  data: ProfileResponse;
  patch: (body: Record<string, unknown>) => Promise<boolean>;
  editAnchorRef: React.RefObject<HTMLDivElement | null>;
  editOpen: boolean;
  setEditOpen: (v: boolean) => void;
  editTab: EditTab;
  setEditTab: (t: EditTab) => void;
  openEdit: (which?: EditTab) => void;
  onJumpCompletion: (href?: string) => void;
  onConnectSocial: (p: SocialAccount["platform"]) => void;
  onDisconnectSocial: (id: string) => void;
}) {
  const { profile, address, stats, verification, preferences, socialAccounts, completion } = data;

  return (
    <div className="space-y-5">
      {/* Two-column on desktop, single column on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left rail (1/3) — about, contact, work */}
        <div className="space-y-5 lg:col-span-1">
          <Card
            title="Intro"
            icon={<Sparkles className="w-3.5 h-3.5" />}
            tone="indigo"
          >
            <p className="text-sm text-gray-300 whitespace-pre-wrap">
              {profile.bio || (
                <span className="text-gray-500 italic">
                  No bio yet. Click Edit Profile to add one.
                </span>
              )}
            </p>
            <div className="space-y-2 mt-3 pt-3 border-t border-gray-800">
              <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label={profile.email} sub="Email" />
              {profile.phone && (
                <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label={profile.phone} sub="Phone" />
              )}
              {profile.profession && (
                <InfoRow icon={<Briefcase className="w-3.5 h-3.5" />} label={profile.profession} sub="Works as" />
              )}
              {profile.country && (
                <InfoRow
                  icon={<MapPin className="w-3.5 h-3.5" />}
                  label={COUNTRIES.find((c) => c.code === profile.country)?.name ?? profile.country}
                  sub="From"
                />
              )}
              {profile.language && (
                <InfoRow
                  icon={<Languages className="w-3.5 h-3.5" />}
                  label={LANGUAGES.find((l) => l.code === profile.language)?.name ?? profile.language}
                  sub="Speaks"
                />
              )}
              <InfoRow
                icon={<Calendar className="w-3.5 h-3.5" />}
                label={new Date(profile.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
                sub="Joined"
              />
            </div>
            <button
              onClick={() => openEdit("personal")}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Details
            </button>
          </Card>

          <Card
            title="Profile Completion"
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            tone="emerald"
          >
            <div className="flex items-center gap-3">
              <CompletionRing percentage={completion.percentage} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400">
                  {completion.percentage === 100
                    ? "All set!"
                    : `${completion.missing.length} item${completion.missing.length === 1 ? "" : "s"} left`}
                </p>
                <p className="text-[11px] text-indigo-400 mt-0.5">
                  Higher % = better task acceptance
                </p>
              </div>
            </div>
            {completion.missing.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-44 overflow-y-auto">
                {completion.missing.slice(0, 8).map((it) => (
                  <button
                    key={it.key}
                    onClick={() => onJumpCompletion(it.href)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 text-left transition-colors"
                  >
                    <Circle className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                    <span className="text-xs text-gray-300 flex-1 truncate">{it.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right rail (2/3) — about, address, verification, socials, lifetime */}
        <div className="space-y-5 lg:col-span-2">
          <Card
            title="Personal Info"
            icon={<User className="w-3.5 h-3.5" />}
            tone="purple"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
              <DataLine label="First name" value={profile.firstName} />
              <DataLine label="Last name" value={profile.lastName} />
              <DataLine label="Username" value={profile.username && `@${profile.username}`} />
              <DataLine
                label="Date of birth"
                value={
                  profile.dateOfBirth
                    ? new Date(profile.dateOfBirth).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : null
                }
              />
              <DataLine label="Gender" value={profile.gender} />
              <DataLine
                label="Blood group"
                value={profile.bloodGroup}
                icon={<Droplet className="w-3.5 h-3.5 text-rose-400" />}
              />
              <DataLine label="Nationality" value={profile.nationality} />
              <DataLine
                label="Profession"
                value={profile.profession}
                icon={<Briefcase className="w-3.5 h-3.5 text-amber-400" />}
              />
              <DataLine label="Secondary email" value={profile.secondaryEmail} />
              <DataLine label="Secondary phone" value={profile.secondaryPhone} />
            </div>
            <div className="flex justify-end pt-3 mt-3 border-t border-gray-800">
              <button
                onClick={() => openEdit("personal")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Personal Info
              </button>
            </div>
          </Card>

          <Card
            title="Address"
            icon={<MapPin className="w-3.5 h-3.5" />}
            tone="rose"
          >
            {address.street ||
            address.village ||
            address.city ||
            address.district ||
            address.country ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
                <DataLine label="Street / House" value={address.street} />
                <DataLine label="Village / Neighborhood" value={address.village} />
                <DataLine label="City" value={address.city} />
                <DataLine label="Sub-district" value={address.subDistrict} />
                <DataLine label="District" value={address.district} />
                <DataLine label="Division / State" value={address.division} />
                <DataLine label="Region" value={address.region} />
                <DataLine label="Postal Code" value={address.postalCode} />
                <DataLine label="Country" value={address.country} />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 p-4 text-center">
                <MapPin className="w-6 h-6 text-gray-600 mx-auto mb-1" />
                <p className="text-sm text-gray-400 font-semibold">
                  No address set yet
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Add one to boost your profile completion.
                </p>
              </div>
            )}
            <div className="flex justify-end pt-3 mt-3 border-t border-gray-800">
              <button
                onClick={() => openEdit("address")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Address
              </button>
            </div>
          </Card>

          <Card
            title="Verification & Security"
            icon={<Shield className="w-3.5 h-3.5" />}
            tone="sky"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <VerifTile
                icon={<Mail className="w-4 h-4" />}
                label="Email"
                ok={verification.isEmailVerified}
                action={
                  verification.isEmailVerified
                    ? null
                    : { label: "Verify", href: "/verify-email" }
                }
              />
              <VerifTile
                icon={<Phone className="w-4 h-4" />}
                label="Phone"
                ok={verification.isPhoneVerified}
                action={
                  verification.isPhoneVerified
                    ? null
                    : { label: "Verify", href: "/verify-phone" }
                }
              />
              <VerifTile
                icon={<Shield className="w-4 h-4" />}
                label="KYC"
                ok={verification.kycStatus === "APPROVED"}
                pending={verification.kycStatus === "PENDING"}
                rejected={verification.kycStatus === "REJECTED"}
                action={
                  verification.kycStatus === "APPROVED"
                    ? null
                    : verification.kycStatus === "REJECTED"
                    ? { label: "Appeal", href: "/kyc/appeal" }
                    : { label: "Submit", href: "/kyc" }
                }
              />
              <VerifTile
                icon={<Lock className="w-4 h-4" />}
                label="2FA"
                ok={verification.twoFactorEnabled}
                action={
                  verification.twoFactorEnabled
                    ? null
                    : { label: "Enable", href: "/2fa-setup" }
                }
              />
            </div>
          </Card>

          <Card
            title="Courses & Marketplace"
            icon={<GraduationCap className="w-3.5 h-3.5" />}
            tone="emerald"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Courses */}
              <div className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-bold text-white">Courses</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/courses?filter=enrolled"
                    className="rounded-lg border border-gray-800 bg-gray-900 p-2 hover:border-emerald-500/40 transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      Enrolled
                    </p>
                    <p className="text-lg font-extrabold text-white tabular-nums">
                      {stats.coursesEnrolled.toLocaleString()}
                    </p>
                  </Link>
                  <Link
                    href="/courses?filter=created"
                    className="rounded-lg border border-gray-800 bg-gray-900 p-2 hover:border-emerald-500/40 transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      Created
                    </p>
                    <p className="text-lg font-extrabold text-white tabular-nums">
                      {stats.coursesCreated.toLocaleString()}
                    </p>
                  </Link>
                </div>
                <Link
                  href="/courses"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 font-semibold"
                >
                  Browse courses
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Marketplace */}
              <div className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-bold text-white">Marketplace</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Link
                    href="/marketplace?tab=listings"
                    className="rounded-lg border border-gray-800 bg-gray-900 p-2 hover:border-amber-500/40 transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      Listings
                    </p>
                    <p className="text-lg font-extrabold text-white tabular-nums">
                      {stats.marketplaceListings.toLocaleString()}
                    </p>
                  </Link>
                  <Link
                    href="/marketplace?tab=sales"
                    className="rounded-lg border border-gray-800 bg-gray-900 p-2 hover:border-amber-500/40 transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      Sales
                    </p>
                    <p className="text-lg font-extrabold text-white tabular-nums">
                      {stats.marketplaceSales.toLocaleString()}
                    </p>
                  </Link>
                  <Link
                    href="/marketplace?tab=purchases"
                    className="rounded-lg border border-gray-800 bg-gray-900 p-2 hover:border-amber-500/40 transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      Bought
                    </p>
                    <p className="text-lg font-extrabold text-white tabular-nums">
                      {stats.marketplacePurchases.toLocaleString()}
                    </p>
                  </Link>
                </div>
                {stats.marketplaceSalesAmount > 0 && (
                  <p className="text-[11px] text-amber-300 mt-2 inline-flex items-center gap-1">
                    <Coins className="w-3 h-3" />
                    Earned{" "}
                    <span className="font-bold tabular-nums">
                      ${stats.marketplaceSalesAmount.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </span>{" "}
                    from sales
                  </p>
                )}
                <Link
                  href="/marketplace"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 font-semibold"
                >
                  Open marketplace
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </Card>

          <BecomeTutorCard />

          <Card
            title="Connected Social Accounts"
            icon={<Globe className="w-3.5 h-3.5" />}
            tone="amber"
          >
            {socialAccounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 p-4 text-center">
                <Globe className="w-6 h-6 text-gray-600 mx-auto mb-1" />
                <p className="text-sm text-gray-400 font-semibold">
                  No social accounts connected
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Connect them to show your reach.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {socialAccounts.map((acc) => {
                  const meta = PLATFORM_META[acc.platform];
                  return (
                    <div
                      key={acc.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-gray-950 border border-gray-800"
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 bg-linear-to-br",
                          meta.gradient
                        )}
                      >
                        <meta.icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          @{acc.username}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {acc.followers.toLocaleString()} {meta.countLabel.toLowerCase()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end pt-3 mt-3 border-t border-gray-800">
              <button
                onClick={() => openEdit("social")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                Manage Social Accounts
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* Edit drawer (in-page accordion) */}
      <div ref={editAnchorRef} className="scroll-mt-20">
        <button
          onClick={() => setEditOpen(!editOpen)}
          className="w-full flex items-center justify-between gap-3 p-4 glass glass-hover"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
              <Edit3 className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-white">Edit Profile & Settings</p>
              <p className="text-[11px] text-gray-500">
                Personal info, address, KYC, privacy, theme, security
              </p>
            </div>
          </div>
          <ChevronRight
            className={cn(
              "w-5 h-5 text-gray-500 transition-transform",
              editOpen && "rotate-90"
            )}
          />
        </button>

        {editOpen && (
          <div className="mt-3 space-y-3">
            <nav className="flex gap-1 overflow-x-auto -mx-2 px-2 pb-1 border-b border-gray-800 scrollbar-thin">
              {(
                [
                  { key: "personal", label: "Personal", icon: User },
                  { key: "address", label: "Address", icon: MapPin },
                  { key: "kyc", label: "KYC", icon: Shield },
                  { key: "social", label: "Social", icon: Twitter },
                  { key: "privacy", label: "Privacy", icon: Lock },
                  { key: "theme", label: "Theme", icon: Palette },
                  { key: "security", label: "Security", icon: Shield },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setEditTab(t.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                    editTab === t.key
                      ? "bg-indigo-500/15 text-white border border-indigo-500/40"
                      : "text-gray-400 hover:text-white hover:bg-gray-900"
                  )}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </nav>

            {editTab === "personal" && <PersonalTab data={data} patch={patch} />}
            {editTab === "address" && <AddressTab data={data} patch={patch} />}
            {editTab === "kyc" && <KycTab data={data} />}
            {editTab === "social" && (
              <SocialTab
                accounts={socialAccounts}
                onConnect={onConnectSocial}
                onDisconnect={onDisconnectSocial}
              />
            )}
            {editTab === "privacy" && (
              <PrivacyTab privacy={preferences.privacy} patch={patch} />
            )}
            {editTab === "theme" && <ThemeTab preferences={preferences} patch={patch} />}
            {editTab === "security" && <SecurityTab verification={verification} />}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-500 mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white truncate">{label}</p>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
          {sub}
        </p>
      </div>
    </div>
  );
}

function DataLine({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
        {label}
      </p>
      <p className="text-sm text-white mt-0.5 inline-flex items-center gap-1.5">
        {icon}
        {value || <span className="text-gray-600 italic">—</span>}
      </p>
    </div>
  );
}

function VerifTile({
  icon,
  label,
  ok,
  pending,
  rejected,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  ok: boolean;
  pending?: boolean;
  rejected?: boolean;
  action: { label: string; href: string } | null;
}) {
  const status = ok
    ? { tone: "border-emerald-500/30 bg-emerald-500/10", color: "text-emerald-400", text: "Verified" }
    : pending
    ? { tone: "border-amber-500/30 bg-amber-500/10", color: "text-amber-400", text: "Pending" }
    : rejected
    ? { tone: "border-red-500/30 bg-red-500/10", color: "text-red-400", text: "Rejected" }
    : { tone: "border-gray-700 bg-gray-950", color: "text-gray-400", text: "Not set" };

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border",
        status.tone
      )}
    >
      <div className={cn("p-1.5 rounded-md bg-black/20", status.color)}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white">{label}</p>
        <p className={cn("text-[11px] font-semibold", status.color)}>
          {status.text}
        </p>
      </div>
      {action && (
        <Link
          href={action.href}
          className="text-[11px] font-bold text-indigo-300 hover:text-indigo-200 px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 whitespace-nowrap"
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}

function CompletionRing({ percentage }: { percentage: number }) {
  const ringColor =
    percentage >= 90
      ? "stroke-emerald-400"
      : percentage >= 60
      ? "stroke-amber-400"
      : "stroke-indigo-400";
  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" className="fill-none stroke-gray-800" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r="42"
          className={cn("fill-none transition-[stroke-dashoffset]", ringColor)}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={Math.PI * 84}
          strokeDashoffset={Math.PI * 84 * (1 - percentage / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-extrabold text-white tabular-nums">{percentage}%</span>
      </div>
    </div>
  );
}

// ───────────────────────────── Posts list tab ─────────────────────────────

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

function PostsListTab({ userId }: { userId: string }) {
  const [items, setItems] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/users/${userId}/posts?limit=20`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancel) setItems(d.posts ?? []);
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
      <div className="text-center py-12 text-gray-500 text-sm inline-flex items-center justify-center gap-2 w-full">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading posts…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center">
        <ImageIcon className="w-10 h-10 text-gray-700 mx-auto mb-2" />
        <p className="text-sm text-gray-400 font-semibold">No posts yet</p>
        <p className="text-xs text-gray-600 mt-1">
          Your published posts will appear here.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((p) => (
        <div
          key={p.id}
          className="glass glass-hover p-4"
        >
          {p.isPinned && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">
              📌 Pinned
            </span>
          )}
          {p.content && (
            <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
              {p.content}
            </p>
          )}
          {p.images.length > 0 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.images[0]}
              alt=""
              className="mt-3 w-full max-h-96 rounded-lg object-cover bg-gray-950"
            />
          )}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <EyeIcon className="w-3.5 h-3.5" />
              <span className="tabular-nums">{p.viewsCount.toLocaleString()}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <ThumbsUp className="w-3.5 h-3.5" />
              <span className="tabular-nums">{p.likesCount.toLocaleString()}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="tabular-nums">{p.commentsCount.toLocaleString()}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Share2 className="w-3.5 h-3.5" />
              <span className="tabular-nums">{p.sharesCount.toLocaleString()}</span>
            </span>
            <span className="ml-auto">
              {new Date(p.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────── User list tab (followers/following) ─────────────────────────────

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
              <div className="relative w-11 h-11 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold overflow-hidden">
                {u.avatar ? (
                  <SmartImage src={u.avatar} alt="" fill sizes="44px" className="object-cover" />
                ) : (
                  initial
                )}
              </div>
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

// ───────────────────────────── Analytics Tab ─────────────────────────────

function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetch("/api/profile/analytics")
      .then((r) => r.json())
      .then((d) => {
        if (!cancel) setData(d as AnalyticsResp);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  return <AnalyticsPanel data={data} loading={loading} />;
}

// ───────────────────────────── Modals ─────────────────────────────

function TagModal({
  selected,
  onClose,
  onSave,
}: {
  selected: string[];
  onClose: () => void;
  onSave: (tags: string[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 3) {
        toast.error("Pick up to 3 tags");
        return prev;
      }
      return [...prev, id];
    });
  };
  return (
    <Modal onClose={busy ? undefined : onClose} title="Choose Profile Tags" subtitle="Pick up to 3">
      <div className="grid grid-cols-2 gap-2">
        {TAG_OPTIONS.map((t) => {
          const isOn = picked.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg border text-left",
                isOn
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-gray-800 bg-gray-950 hover:border-gray-700"
              )}
            >
              <span className="text-lg">{t.emoji}</span>
              <span className="text-sm text-white flex-1">{t.label}</span>
              {isOn && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
          Cancel
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            await onSave(picked);
            setBusy(false);
          }}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Save
        </button>
      </div>
    </Modal>
  );
}

function PhotoModal({
  target,
  currentUrl,
  onClose,
  onSaved,
}: {
  target: "avatar" | "coverPhoto";
  currentUrl: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Build preview from selected File
  useEffect(() => {
    if (!file) return;
    const obj = URL.createObjectURL(file);
    setPreviewUrl(obj);
    return () => URL.revokeObjectURL(obj);
  }, [file]);

  const handleFileSelect = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8 MB");
      return;
    }
    setFile(f);
    setUrlInput("");
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const uploadFile = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("target", target);
      const res = await fetch("/api/profile/photo", {
        method: "POST",
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(target === "avatar" ? "Profile photo updated" : "Cover photo updated");
      onSaved();
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const saveUrl = async () => {
    if (!urlInput.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [target]: urlInput.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Saved");
      onSaved();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!(await confirmDialog({ title: `Remove ${target === "avatar" ? "profile photo" : "cover photo"}?`, tone: "danger", confirmLabel: "Remove" }))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [target]: null }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Removed");
      onSaved();
    } catch (err) {
      toast.error("Couldn't remove", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={busy ? undefined : onClose}
      title={target === "avatar" ? "Update Profile Photo" : "Update Cover Photo"}
      subtitle="Upload from your device, or paste a public image URL"
    >
      <div className="space-y-4">
        {previewUrl && (
          <div
            className={cn(
              "rounded-lg overflow-hidden border border-gray-800 bg-gray-950",
              target === "avatar"
                ? "w-32 h-32 mx-auto rounded-full"
                : "w-full aspect-[5/2]"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Drag & drop / click upload */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "relative rounded-xl border-2 border-dashed p-5 cursor-pointer text-center transition-colors",
            dragOver
              ? "border-indigo-500 bg-indigo-500/5"
              : "border-gray-700 hover:border-indigo-500/50 hover:bg-gray-950"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
          />
          <Upload className="w-7 h-7 text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-white font-semibold">
            {file ? file.name : "Click or drag image here"}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            JPG, PNG, WebP, GIF · Up to 8 MB
          </p>
        </div>

        {file && (
          <button
            onClick={uploadFile}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload {target === "avatar" ? "Profile Photo" : "Cover Photo"}
          </button>
        )}

        {/* OR divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            or paste URL
          </span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              if (e.target.value) {
                setFile(null);
                setPreviewUrl(e.target.value);
              }
            }}
            placeholder="https://..."
            className={cn(inp, "font-mono text-xs flex-1")}
          />
          <button
            onClick={saveUrl}
            disabled={busy || !urlInput.trim()}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 whitespace-nowrap"
          >
            Use URL
          </button>
        </div>

        {currentUrl && (
          <button
            onClick={removePhoto}
            disabled={busy}
            className="w-full text-xs text-red-400 hover:text-red-300 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove current photo
          </button>
        )}
      </div>

      <div className="flex justify-end mt-5 pt-4 border-t border-gray-800">
        <button
          onClick={onClose}
          disabled={busy}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

function ConnectSocialModal({
  platform,
  existing,
  onClose,
  onSaved,
}: {
  platform: SocialAccount["platform"];
  existing: SocialAccount | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = PLATFORM_META[platform];
  const [username, setUsername] = useState(existing?.username ?? "");
  const [followers, setFollowers] = useState(existing?.followers ?? 0);
  const [following, setFollowing] = useState(existing?.following ?? 0);
  const [postsCount, setPostsCount] = useState(existing?.postsCount ?? 0);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (username.trim().length < 2) {
      toast.error("Enter your username");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          username: username.trim(),
          followers,
          following,
          postsCount,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      toast.success(existing ? "Updated" : `Connected ${meta.label}`);
      onSaved();
    } catch (err) {
      toast.error("Couldn't save", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={busy ? undefined : onClose}
      title={`${existing ? "Update" : "Connect"} ${meta.label}`}
      subtitle="Stats are shown on your profile. Admin can verify them later."
    >
      <div className="space-y-3">
        <Field label="Username">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@yourname"
            className={inp}
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label={meta.countLabel}>
            <input
              type="number"
              min={0}
              value={followers}
              onChange={(e) => setFollowers(parseInt(e.target.value) || 0)}
              className={inp}
            />
          </Field>
          <Field label="Following">
            <input
              type="number"
              min={0}
              value={following}
              onChange={(e) => setFollowing(parseInt(e.target.value) || 0)}
              className={inp}
            />
          </Field>
          <Field label="Posts">
            <input
              type="number"
              min={0}
              value={postsCount}
              onChange={(e) => setPostsCount(parseInt(e.target.value) || 0)}
              className={inp}
            />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {existing ? "Save" : "Connect"}
        </button>
      </div>
    </Modal>
  );
}

// ───────────────────────────── tiny UI helpers ─────────────────────────────

const inp =
  "w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

/**
 * Username handle field with a leading "@", live availability check and a
 * preview of the resulting profile link. Setting a handle makes the user's
 * profile reachable at /u/<username> (the /u/[id] page redirects id → handle).
 */
function UsernameField({
  value,
  onChange,
  currentUsername,
}: {
  value: string;
  onChange: (v: string) => void;
  currentUsername: string | null;
}) {
  const clean = value.replace(/^@+/, "").trim();
  const isCurrent =
    !!currentUsername && clean.toLowerCase() === currentUsername.toLowerCase();
  const formatValid = USERNAME_REGEX.test(clean);
  const needsRemote = !!clean && !isCurrent && formatValid;

  // Availability result, tagged with the handle it belongs to so a stale
  // response never shows against a newer input.
  const [remote, setRemote] = useState<{ u: string; available: boolean } | null>(
    null
  );

  useEffect(() => {
    if (!needsRemote) return;
    let cancel = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/profile/username-available?u=${encodeURIComponent(clean)}`
        );
        const d = await r.json();
        if (!cancel) setRemote({ u: clean, available: !!d.available });
      } catch {
        /* leave prior state; treat as unknown */
      }
    }, 450);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [clean, needsRemote]);

  // Derive the display status synchronously (no setState-in-effect).
  const status: "idle" | "current" | "invalid" | "checking" | "available" | "taken" =
    !clean
      ? "idle"
      : isCurrent
        ? "current"
        : !formatValid
          ? "invalid"
          : remote && remote.u === clean
            ? remote.available
              ? "available"
              : "taken"
            : "checking";

  return (
    <Field label="Username">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
          @
        </span>
        <input
          value={clean}
          onChange={(e) =>
            onChange(e.target.value.replace(/^@+/, "").replace(/\s+/g, ""))
          }
          placeholder="yourname"
          maxLength={30}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cn(inp, "pl-7 pr-9")}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {status === "checking" && (
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          )}
          {(status === "available" || status === "current") && (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          )}
          {(status === "taken" || status === "invalid") && (
            <X className="w-4 h-4 text-rose-400" />
          )}
        </span>
      </div>
      {status === "invalid" ? (
        <p className="mt-1 text-[11px] text-rose-400">
          3-30 characters: letters, numbers, dot, underscore or hyphen.
        </p>
      ) : status === "taken" ? (
        <p className="mt-1 text-[11px] text-rose-400">
          This username is already taken.
        </p>
      ) : clean.trim() ? (
        <p className="mt-1 text-[11px] text-gray-400">
          {status === "available" ? "Available — " : ""}Profile link:{" "}
          <span className="text-indigo-300">/u/{clean.trim()}</span>
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-gray-500">
          Pick a public @handle — this becomes your profile link (/u/yourname).
        </p>
      )}
    </Field>
  );
}

function Card({
  title,
  icon,
  tone,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  tone?: "indigo" | "purple" | "amber" | "emerald" | "rose" | "sky";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones: Record<NonNullable<typeof tone>, string> = {
    indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    rose: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    sky: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  };
  return (
    <div className="glass glass-hover p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <div
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center border shrink-0",
                tone ? tones[tone] : "bg-gray-800 text-gray-400 border-gray-700"
              )}
            >
              {icon}
            </div>
          )}
          <h3 className="text-sm font-bold text-white truncate">{title}</h3>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded bg-gray-800 border-gray-600 text-indigo-500"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">{label}</p>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    </label>
  );
}

function Modal({
  onClose,
  title,
  subtitle,
  children,
}: {
  onClose?: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative glass-strong rounded-xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
