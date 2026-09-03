import { usd } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { getUserActivity } from "@/lib/user-activity";
import { UserActivityTimeline } from "@/components/admin/activity/user-activity-timeline";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  CheckCircle,
  Wallet,
  Star,
  Trophy,
  Users,
  Gift,
  FileCheck,
  Activity,
  ShoppingBag,
  GraduationCap,
  Eye as EyeIcon,
  ThumbsUp,
  MessageSquare,
  Share2,
  UserPlus,
  Pin,
} from "lucide-react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { profileHref } from "@/lib/user-href";
import { ROLE_CONFIG, type UserRole } from "@/lib/rbac";
import { UserDetailActions, AdjustBalanceButton } from "@/components/admin/user-detail-actions";
import { DisplayBoostPanel } from "@/components/admin/users/display-boost-panel";
import {
  PackageBadge,
  LevelBadge,
  RankBadge,
} from "@/components/user/profile/badges";
import { VerifiedBadge } from "@/components/user/profile/verified-badge";
import { userDisplayId } from "@/lib/display-id";
import { AdminUserAnalyticsTab } from "@/components/admin/users/admin-user-analytics";
import { getXpRank, levelProgress } from "@/lib/user-rank";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { Avatar } from "@/components/user/primitives/avatar";
import { AdminTable } from "@/components/admin/ui/admin-table";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    edit?: string;
    ban?: string;
    delete?: string;
  }>;
}

export default async function UserDetailPage({ params, searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  if (!(await can(session.user.id, "users.view"))) {
    redirect("/admin");
  }

  const { id } = await params;
  const {
    tab = "overview",
    edit,
    ban,
    delete: del,
  } = await searchParams;

  // The users list links Edit → ?edit=1; send it to the real edit form.
  if (edit) {
    redirect(`/admin/users/${id}/edit`);
  }

  // Fetch user with related data using separate queries
  const [userData, counts, coursesCreatedCount, marketplaceSalesAgg] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id },
        include: {
          package: {
            select: { id: true, slug: true, name: true, badgeColor: true },
          },
          transactions: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          taskSubmissions: {
            orderBy: { createdAt: "desc" },
            take: 10,
            include: {
              task: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  pointsReward: true,
                },
              },
            },
          },
          withdrawals: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          referrals: {
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              createdAt: true,
              status: true,
            },
          },
          kycDocuments: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          referredBy: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              referralCode: true,
            },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id },
        select: {
          _count: {
            select: {
              referrals: true,
              taskSubmissions: true,
              transactions: true,
              withdrawals: true,
              posts: true,
              courseEnrollments: true,
              marketplaceListings: true,
              marketplacePurchases: true,
              socialAccounts: true,
            },
          },
        },
      }),
      prisma.course.count({ where: { createdById: id } }),
      prisma.marketplacePurchase.aggregate({
        where: { listing: { sellerId: id }, status: "COMPLETED" },
        _count: { _all: true },
        _sum: { sellerAmount: true },
      }),
    ]);

  if (!userData || !counts) {
    notFound();
  }

  // Type assertion needed due to Prisma Accelerate extension type inference issues
  const user = userData as typeof userData & {
    transactions: Array<{
      id: string;
      type: string;
      points: number;
      amount: number;
      description: string | null;
      status: string;
      createdAt: Date;
    }>;
    taskSubmissions: Array<{
      id: string;
      status: string;
      createdAt: Date;
      task: {
        id: string;
        title: string;
        type: string;
        pointsReward: number;
      };
    }>;
    withdrawals: Array<{
      id: string;
      amount: number;
      fee: number;
      netAmount: number;
      method: string;
      status: string;
      createdAt: Date;
    }>;
    referrals: Array<{
      id: string;
      name: string | null;
      email: string;
      avatar: string | null;
      status: string;
      createdAt: Date;
    }>;
    referredBy: {
      id: string;
      name: string | null;
      email: string;
      username: string | null;
      referralCode: string;
    } | null;
    package: {
      id: string;
      slug: string;
      name: string;
      badgeColor: string | null;
    } | null;
  };

  const roleConfig = ROLE_CONFIG[user.role as UserRole] || ROLE_CONFIG.USER;
  const marketplaceSalesCount = marketplaceSalesAgg._count._all;
  const marketplaceSalesAmount = toNum(marketplaceSalesAgg._sum.sellerAmount);

  // Displayed counts = max(0, real + admin display-boost). Match the formula
  // used by /api/profile and /api/users/[id]/profile so the admin sees the
  // exact same numbers that everyone else sees on the user's public profile.
  const displayedPosts = Math.max(
    0,
    counts._count.posts + user.displayPostsBoost
  );
  const displayedFollowers = Math.max(
    0,
    user.followersCount + user.displayFollowersBoost
  );
  const displayedFollowing = Math.max(
    0,
    user.followingCount + user.displayFollowingBoost
  );

  // XP progress for the LevelBadge
  const { xpProgress, xpNeeded, xpPercentage } = levelProgress(
    user.level,
    user.xp
  );
  const rank = await getXpRank(id, user.xp);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "activity", label: "Activity" },
    { id: "posts", label: "Posts", count: displayedPosts },
    { id: "followers", label: "Followers", count: displayedFollowers },
    { id: "following", label: "Following", count: displayedFollowing },
    { id: "analytics", label: "Analytics" },
    { id: "transactions", label: "Transactions", count: counts._count.transactions },
    { id: "tasks", label: "Tasks", count: counts._count.taskSubmissions },
    { id: "referrals", label: "Referrals", count: counts._count.referrals },
    { id: "withdrawals", label: "Withdrawals", count: counts._count.withdrawals },
  ];

  // Conditionally fetch tab-specific data so we don't pay the cost on every tab.
  type FollowUserSummary = {
    id: string;
    name: string | null;
    username: string | null;
    avatar: string | null;
    isBlueVerified: boolean;
    verifiedBadgeStyle: string | null;
    followersCount: number;
    displayFollowersBoost: number;
  };
  type FollowerRow = { createdAt: Date; follower: FollowUserSummary };
  type FollowingRow = { createdAt: Date; following: FollowUserSummary };
  type PostRow = {
    id: string;
    content: string;
    images: string[];
    isPublic: boolean;
    isPinned: boolean;
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    viewsCount: number;
    createdAt: Date;
  };

  // Unified per-user activity timeline (only on the Activity tab).
  const activityEvents = tab === "activity" ? await getUserActivity(id) : [];

  const [postsRaw, followersRaw, followingRaw] = await Promise.all([
    tab === "posts"
      ? prisma.post.findMany({
          where: { userId: id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            content: true,
            images: true,
            isPublic: true,
            isPinned: true,
            likesCount: true,
            commentsCount: true,
            sharesCount: true,
            viewsCount: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    tab === "followers"
      ? prisma.follow.findMany({
          where: { followingId: id },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            createdAt: true,
            follower: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                isBlueVerified: true,
                verifiedBadgeStyle: true,
                followersCount: true,
                displayFollowersBoost: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    tab === "following"
      ? prisma.follow.findMany({
          where: { followerId: id },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            createdAt: true,
            following: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                isBlueVerified: true,
                verifiedBadgeStyle: true,
                followersCount: true,
                displayFollowersBoost: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const posts = postsRaw as unknown as PostRow[];
  const followers = followersRaw as unknown as FollowerRow[];
  const following = followingRaw as unknown as FollowingRow[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/users"
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">User Profile</h1>
          <p className="text-gray-400">
            Manage user account and view activity
          </p>
        </div>
        <UserDetailActions
          userId={id}
          userName={user.name}
          userEmail={user.email}
          userStatus={user.status}
          canEdit={await can(session.user.id, "users.edit") && (user.role !== "SUPER_ADMIN" || adminRole === "SUPER_ADMIN")}
          canBan={await can(session.user.id, "users.ban") && user.role !== "SUPER_ADMIN"}
          canDelete={await can(session.user.id, "users.delete") && user.role !== "SUPER_ADMIN"}
          canApprove={await can(session.user.id, "users.edit") && (user.role !== "SUPER_ADMIN" || adminRole === "SUPER_ADMIN")}
          initialAction={ban ? "ban" : del ? "delete" : undefined}
          canImpersonate={adminRole === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN" && user.id !== session.user.id}
        />
      </div>

      {/* Admin context banner */}
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-xs text-red-200 flex items-center gap-2">
        <Activity className="w-3.5 h-3.5" />
        <span>
          You&apos;re viewing this user as an admin. Actions on this page affect
          their account.
        </span>
      </div>

      {/* User hero card — cover + avatar + badges (mirrors user-side /profile) */}
      <div className="relative rounded-2xl overflow-hidden border border-gray-800">
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
              fallbackText={user.name?.charAt(0) || user.email?.charAt(0) || "U"}
              className="border-4 border-gray-900 shadow-xl"
            />
          </div>

          <div className="flex justify-end mb-2 gap-2">
            <Link
              href={profileHref(user)}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold"
            >
              <EyeIcon className="w-3.5 h-3.5" />
              View public profile
            </Link>
          </div>

          <div className="flex items-start gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">
                  {user.name || "Unnamed"}
                </h1>
                {user.isBlueVerified && (
                  <VerifiedBadge
                    style={user.verifiedBadgeStyle}
                    size="md"
                  />
                )}
              </div>
              {user.username && (
                <p className="text-gray-500 text-sm mt-0.5">
                  @{user.username}
                </p>
              )}
            </div>
          </div>

          {/* Status + role + package + level + rank pills */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {user.package && (
              <PackageBadge
                tier={user.package.slug}
                name={user.package.name}
              />
            )}
            <LevelBadge
              level={user.level}
              xp={user.xp}
              xpNeeded={xpNeeded}
              xpProgress={xpProgress}
              xpPercentage={xpPercentage}
            />
            <RankBadge rank={rank} />
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                user.status === "ACTIVE"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : user.status === "PENDING_VERIFICATION"
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                  : user.status === "SUSPENDED"
                  ? "bg-orange-500/10 text-orange-400 border border-orange-500/30"
                  : "bg-red-500/10 text-red-400 border border-red-500/30"
              }`}
            >
              {user.status.replace(/_/g, " ")}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border border-current/30 ${roleConfig.bgColor} ${roleConfig.color}`}
            >
              {roleConfig.label}
            </span>
          </div>

          {user.bio && (
            <p className="text-sm text-gray-300 mt-3 whitespace-pre-wrap leading-relaxed">
              {user.bio}
            </p>
          )}

          <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-indigo-400" />
              {user.email}
              {user.emailVerified && (
                <CheckCircle className="w-3 h-3 text-emerald-400" />
              )}
            </span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
              {userDisplayId(user.id)}
            </span>
            {user.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                {user.phone}
                {user.phoneVerified && (
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                )}
              </span>
            )}
            {user.country && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                {user.country}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              Joined {format(user.createdAt, "MMM d, yyyy")} (
              {formatDistanceToNow(user.createdAt, { addSuffix: true })})
            </span>
            {user.lastLoginAt && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                Last active{" "}
                {formatDistanceToNow(user.lastLoginAt, { addSuffix: true })}
              </span>
            )}
          </div>

          {/* Posts / Followers / Following inline counters */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-800">
            <Link
              href={`/admin/users/${id}?tab=posts`}
              className="text-center hover:bg-gray-800/50 rounded-lg py-2 transition-colors"
            >
              <p className="text-lg sm:text-xl font-extrabold text-white tabular-nums">
                {displayedPosts.toLocaleString()}
              </p>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-bold mt-0.5">
                Posts
              </p>
            </Link>
            <Link
              href={`/admin/users/${id}?tab=followers`}
              className="text-center hover:bg-gray-800/50 rounded-lg py-2 transition-colors border-x border-gray-800"
            >
              <p className="text-lg sm:text-xl font-extrabold text-white tabular-nums">
                {displayedFollowers.toLocaleString()}
              </p>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-bold mt-0.5">
                Followers
              </p>
            </Link>
            <Link
              href={`/admin/users/${id}?tab=following`}
              className="text-center hover:bg-gray-800/50 rounded-lg py-2 transition-colors"
            >
              <p className="text-lg sm:text-xl font-extrabold text-white tabular-nums">
                {displayedFollowing.toLocaleString()}
              </p>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-bold mt-0.5">
                Following
              </p>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-gray-500">Level</span>
          </div>
          <p className="text-xl font-bold text-white">{user.level}</p>
          <div className="flex gap-1 mt-1">
            <AdjustBalanceButton userId={id} type="level" action="add" canAdjust={await can(session.user.id, "users.adjust_balance")} />
            <AdjustBalanceButton userId={id} type="level" action="deduct" canAdjust={await can(session.user.id, "users.adjust_balance")} />
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-gray-500">XP</span>
          </div>
          <p className="text-xl font-bold text-white">{user.xp.toLocaleString()}</p>
          <div className="flex gap-1 mt-1">
            <AdjustBalanceButton userId={id} type="xp" action="add" canAdjust={await can(session.user.id, "users.adjust_balance")} />
            <AdjustBalanceButton userId={id} type="xp" action="deduct" canAdjust={await can(session.user.id, "users.adjust_balance")} />
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-indigo-400" />
            <span className="text-xs text-gray-500">Points</span>
          </div>
          <p className="text-xl font-bold text-white">{user.pointsBalance.toLocaleString()}</p>
          <div className="flex gap-1 mt-1">
            <AdjustBalanceButton userId={id} type="points" action="add" canAdjust={await can(session.user.id, "users.adjust_balance")} />
            <AdjustBalanceButton userId={id} type="points" action="deduct" canAdjust={await can(session.user.id, "users.adjust_balance")} />
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-gray-500">Cash Balance</span>
          </div>
          <p className="text-xl font-bold text-white">{usd(user.cashBalance)}</p>
          <div className="flex gap-1 mt-1">
            <AdjustBalanceButton userId={id} type="cash" action="add" canAdjust={await can(session.user.id, "users.adjust_balance")} />
            <AdjustBalanceButton userId={id} type="cash" action="deduct" canAdjust={await can(session.user.id, "users.adjust_balance")} />
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileCheck className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-gray-500">KYC Status</span>
          </div>
          <p className={`text-xl font-bold ${
            user.kycStatus === "APPROVED" ? "text-emerald-400" :
            user.kycStatus === "PENDING" ? "text-amber-400" :
            user.kycStatus === "REJECTED" ? "text-red-400" :
            "text-gray-400"
          }`}>{user.kycStatus.replace(/_/g, " ")}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-gray-500">Referrals</span>
          </div>
          <p className="text-xl font-bold text-white">{counts._count.referrals}</p>
          <p className="text-xs text-gray-500">Code: {user.referralCode}</p>
        </div>
      </div>

      {/* Courses & Marketplace stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
            <p className="text-sm font-bold text-white">Courses</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                Enrolled
              </p>
              <p className="text-xl font-extrabold text-white tabular-nums">
                {counts._count.courseEnrollments.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                Created
              </p>
              <p className="text-xl font-extrabold text-white tabular-nums">
                {coursesCreatedCount.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <p className="text-sm font-bold text-white">Marketplace</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                Listings
              </p>
              <p className="text-lg font-extrabold text-white tabular-nums">
                {counts._count.marketplaceListings.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                Sales
              </p>
              <p className="text-lg font-extrabold text-white tabular-nums">
                {marketplaceSalesCount.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                Bought
              </p>
              <p className="text-lg font-extrabold text-white tabular-nums">
                {counts._count.marketplacePurchases.toLocaleString()}
              </p>
            </div>
          </div>
          {marketplaceSalesAmount > 0 && (
            <p className="text-[11px] text-amber-300 mt-2 inline-flex items-center gap-1">
              <Wallet className="w-3 h-3" />
              Earned{" "}
              <span className="font-bold tabular-nums">
                ${marketplaceSalesAmount.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>{" "}
              from sales
            </p>
          )}
        </div>
      </div>

      {/* Display Boost panel + Bulk follow link */}
      {await can(session.user.id, "users.edit") && (
        <div className="space-y-4">
          <DisplayBoostPanel
            userId={id}
            realFollowers={user.followersCount}
            realFollowing={user.followingCount}
            realPosts={counts._count.posts}
            initialBoost={{
              followers: user.displayFollowersBoost,
              following: user.displayFollowingBoost,
              posts: user.displayPostsBoost,
            }}
            canEdit={await can(session.user.id, "users.edit")}
          />
          <Link
            href={`/admin/users/${id}/boost-followers`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-sm font-bold rounded-lg"
          >
            <Users className="w-4 h-4" />
            Bulk add followers (filter-based)
          </Link>
        </div>
      )}

      {/* Where this account came from. The referrer's name was already being
          fetched and then thrown away — "View referrer" made you click through
          to find out who it was, once per user you were checking. */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Gift className="w-5 h-5 text-indigo-400 shrink-0" />
          <span className="text-sm text-gray-400">Referred by:</span>
          {user.referredBy ? (
            <>
              <Link
                href={`/admin/users/${user.referredBy.id}`}
                className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
              >
                {user.referredBy.name || user.referredBy.username || "Unnamed"}
              </Link>
              <span className="text-xs text-gray-500">
                {user.referredBy.email}
              </span>
              {user.referredBy.referralCode && (
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  {user.referredBy.referralCode}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-gray-500">
              Nobody — signed up directly
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`/admin/users/${id}?tab=${t.id}`}
              className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-red-500 text-white"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-gray-800 rounded">
                  {t.count}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {tab === "activity" && (
          <div className="p-6">
            <UserActivityTimeline events={activityEvents} />
          </div>
        )}

        {tab === "overview" && (
          <div className="p-6 space-y-6">
            {/* Earnings Summary */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Earnings Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Total Earned</p>
                  <p className="text-xl font-bold text-emerald-400">{usd(user.totalEarnings)}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Total Withdrawn</p>
                  <p className="text-xl font-bold text-amber-400">{usd(user.totalWithdrawals)}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  {/* This is EVERY submission (pending + rejected included) —
                      not the same thing as the user's "Tasks Completed", which
                      counts only approved/auto-approved work. Labelled honestly
                      so the two screens stop looking contradictory. */}
                  <p className="text-sm text-gray-400">Task Submissions</p>
                  <p className="text-xl font-bold text-indigo-400">{counts._count.taskSubmissions}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Current Streak</p>
                  <p className="text-xl font-bold text-purple-400">{user.streak} days</p>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {user.transactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        tx.type === "TASK_REWARD" || tx.type === "REFERRAL_BONUS" || tx.type === "BONUS"
                          ? "bg-emerald-500/10"
                          : tx.type === "WITHDRAWAL"
                          ? "bg-red-500/10"
                          : "bg-gray-500/10"
                      }`}>
                        <Activity className={`w-4 h-4 ${
                          tx.type === "TASK_REWARD" || tx.type === "REFERRAL_BONUS" || tx.type === "BONUS"
                            ? "text-emerald-400"
                            : tx.type === "WITHDRAWAL"
                            ? "text-red-400"
                            : "text-gray-400"
                        }`} />
                      </div>
                      <div>
                        <p className="text-sm text-white">{tx.type.replace(/_/g, " ")}</p>
                        <p className="text-xs text-gray-500">{tx.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {tx.points !== 0 && (
                        <p className={`text-sm font-medium ${tx.points > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {tx.points > 0 ? "+" : ""}{tx.points.toLocaleString()} pts
                        </p>
                      )}
                      {tx.amount !== 0 && (
                        <p className={`text-sm font-medium ${tx.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {tx.amount > 0 ? "+" : ""}{usd(tx.amount)}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">{formatDistanceToNow(tx.createdAt, { addSuffix: true })}</p>
                    </div>
                  </div>
                ))}
                {user.transactions.length === 0 && (
                  <p className="text-center text-gray-500 py-8">No transactions yet</p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "posts" && (
          <div className="p-4 sm:p-5">
            {posts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center text-sm text-gray-500">
                No posts yet.
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-gray-800 bg-gray-950 p-4"
                  >
                    {p.isPinned && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">
                        <Pin className="w-3 h-3" />
                        Pinned
                      </span>
                    )}
                    {!p.isPublic && (
                      <span className="inline-flex items-center gap-1 ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                        Private
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
                        className="mt-3 w-full max-h-96 rounded-lg object-cover bg-gray-800"
                      />
                    )}
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <EyeIcon className="w-3.5 h-3.5" />
                        <span className="tabular-nums">
                          {p.viewsCount.toLocaleString()}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span className="tabular-nums">
                          {p.likesCount.toLocaleString()}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span className="tabular-nums">
                          {p.commentsCount.toLocaleString()}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Share2 className="w-3.5 h-3.5" />
                        <span className="tabular-nums">
                          {p.sharesCount.toLocaleString()}
                        </span>
                      </span>
                      <span className="ml-auto">
                        {format(p.createdAt, "MMM d, yyyy")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "followers" && (
          <div className="p-4 sm:p-5">
            {followers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center text-sm text-gray-500">
                No followers yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {followers.map((f) => (
                  <Link
                    key={f.follower.id}
                    href={`/admin/users/${f.follower.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-800 bg-gray-950 hover:border-gray-700 transition-colors"
                  >
                    <Avatar
                      src={f.follower.avatar}
                      size={40}
                      fallbackText={(f.follower.name ?? f.follower.username ?? "U")
                        .charAt(0)
                        .toUpperCase()}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate inline-flex items-center gap-1">
                        {f.follower.name ?? f.follower.username ?? "User"}
                        {f.follower.isBlueVerified && (
                          <VerifiedBadge
                            style={f.follower.verifiedBadgeStyle}
                            size="sm"
                          />
                        )}
                      </p>
                      {f.follower.username && (
                        <p className="text-[11px] text-gray-500">
                          @{f.follower.username}
                        </p>
                      )}
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {Math.max(
                          0,
                          f.follower.followersCount +
                            f.follower.displayFollowersBoost
                        ).toLocaleString()}{" "}
                        followers · Followed{" "}
                        {formatDistanceToNow(f.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                    <UserPlus className="w-4 h-4 text-gray-600 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "following" && (
          <div className="p-4 sm:p-5">
            {following.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center text-sm text-gray-500">
                Not following anyone yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {following.map((f) => (
                  <Link
                    key={f.following.id}
                    href={`/admin/users/${f.following.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-800 bg-gray-950 hover:border-gray-700 transition-colors"
                  >
                    <Avatar
                      src={f.following.avatar}
                      size={40}
                      fallbackText={(f.following.name ?? f.following.username ?? "U")
                        .charAt(0)
                        .toUpperCase()}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate inline-flex items-center gap-1">
                        {f.following.name ?? f.following.username ?? "User"}
                        {f.following.isBlueVerified && (
                          <VerifiedBadge
                            style={f.following.verifiedBadgeStyle}
                            size="sm"
                          />
                        )}
                      </p>
                      {f.following.username && (
                        <p className="text-[11px] text-gray-500">
                          @{f.following.username}
                        </p>
                      )}
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {Math.max(
                          0,
                          f.following.followersCount +
                            f.following.displayFollowersBoost
                        ).toLocaleString()}{" "}
                        followers · Followed{" "}
                        {formatDistanceToNow(f.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                    <UserPlus className="w-4 h-4 text-gray-600 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "analytics" && (
          <div className="p-4 sm:p-5">
            <AdminUserAnalyticsTab userId={id} />
          </div>
        )}

        {tab === "transactions" && (
          <AdminTable<(typeof user.transactions)[number]>
            bare
            rows={user.transactions}
            getRowKey={(tx) => tx.id}
            empty={<div className="py-8 text-center text-gray-500">No transactions found</div>}
            columns={[
              {
                key: "type",
                header: "Type",
                primary: true,
                cell: (tx) => <span className="text-white">{tx.type.replace(/_/g, " ")}</span>,
              },
              {
                key: "description",
                header: "Description",
                cell: (tx) => <span className="text-gray-400">{tx.description || "-"}</span>,
              },
              {
                key: "points",
                header: "Points",
                cell: (tx) => (
                  <span className={`font-medium ${tx.points > 0 ? "text-emerald-400" : tx.points < 0 ? "text-red-400" : "text-gray-400"}`}>
                    {tx.points !== 0 ? `${tx.points > 0 ? "+" : ""}${tx.points.toLocaleString()}` : "-"}
                  </span>
                ),
              },
              {
                key: "amount",
                header: "Amount",
                cell: (tx) => (
                  <span className={`font-medium ${tx.amount > 0 ? "text-emerald-400" : tx.amount < 0 ? "text-red-400" : "text-gray-400"}`}>
                    {tx.amount !== 0 ? `${tx.amount > 0 ? "+" : ""}${usd(tx.amount)}` : "-"}
                  </span>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (tx) => (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    tx.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-400" :
                    tx.status === "PENDING" ? "bg-amber-500/10 text-amber-400" :
                    "bg-red-500/10 text-red-400"
                  }`}>
                    {tx.status}
                  </span>
                ),
              },
              {
                key: "date",
                header: "Date",
                cell: (tx) => <span className="text-gray-400">{format(tx.createdAt, "MMM d, yyyy HH:mm")}</span>,
              },
            ]}
          />
        )}

        {tab === "tasks" && (
          <AdminTable<(typeof user.taskSubmissions)[number]>
            bare
            rows={user.taskSubmissions}
            getRowKey={(s) => s.id}
            empty={<div className="py-8 text-center text-gray-500">No task submissions found</div>}
            columns={[
              {
                key: "task",
                header: "Task",
                primary: true,
                cell: (s) => <span className="text-white">{s.task.title}</span>,
              },
              {
                key: "type",
                header: "Type",
                cell: (s) => <span className="text-gray-400">{s.task.type.replace(/_/g, " ")}</span>,
              },
              {
                key: "status",
                header: "Status",
                cell: (s) => (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    s.status === "APPROVED" ? "bg-emerald-500/10 text-emerald-400" :
                    s.status === "PENDING" ? "bg-amber-500/10 text-amber-400" :
                    "bg-red-500/10 text-red-400"
                  }`}>
                    {s.status}
                  </span>
                ),
              },
              {
                key: "reward",
                header: "Reward",
                cell: (s) => <span className="text-indigo-400">{s.task.pointsReward.toLocaleString()} pts</span>,
              },
              {
                key: "submitted",
                header: "Submitted",
                cell: (s) => <span className="text-gray-400">{formatDistanceToNow(s.createdAt, { addSuffix: true })}</span>,
              },
            ]}
          />
        )}

        {tab === "referrals" && (
          <AdminTable<(typeof user.referrals)[number]>
            bare
            rows={user.referrals}
            getRowKey={(r) => r.id}
            empty={<div className="py-8 text-center text-gray-500">No referrals found</div>}
            columns={[
              {
                key: "user",
                header: "User",
                primary: true,
                cell: (referral) => (
                  <Link href={`/admin/users/${referral.id}`} className="flex items-center gap-3 hover:text-indigo-400 transition-colors">
                    <Avatar
                      src={referral.avatar}
                      name={referral.name || referral.email}
                      size={32}
                    />
                    <div>
                      <p className="text-sm font-medium text-white">{referral.name || "Unnamed"}</p>
                      <p className="text-xs text-gray-500">{referral.email}</p>
                    </div>
                  </Link>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (referral) => (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    referral.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400" :
                    referral.status === "PENDING_VERIFICATION" ? "bg-amber-500/10 text-amber-400" :
                    "bg-red-500/10 text-red-400"
                  }`}>
                    {referral.status.replace(/_/g, " ")}
                  </span>
                ),
              },
              {
                key: "joined",
                header: "Joined",
                cell: (referral) => <span className="text-gray-400">{formatDistanceToNow(referral.createdAt, { addSuffix: true })}</span>,
              },
            ]}
          />
        )}

        {tab === "withdrawals" && (
          <AdminTable<(typeof user.withdrawals)[number]>
            bare
            rows={user.withdrawals}
            getRowKey={(w) => w.id}
            empty={<div className="py-8 text-center text-gray-500">No withdrawals found</div>}
            columns={[
              {
                key: "amount",
                header: "Amount",
                primary: true,
                cell: (w) => <span className="font-medium text-white">{usd(w.amount)}</span>,
              },
              {
                key: "method",
                header: "Method",
                cell: (w) => <span className="text-gray-400">{w.method}</span>,
              },
              {
                key: "status",
                header: "Status",
                cell: (w) => (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    w.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-400" :
                    w.status === "PENDING" ? "bg-amber-500/10 text-amber-400" :
                    w.status === "PROCESSING" ? "bg-blue-500/10 text-blue-400" :
                    "bg-red-500/10 text-red-400"
                  }`}>
                    {w.status}
                  </span>
                ),
              },
              {
                key: "fee",
                header: "Fee",
                cell: (w) => <span className="text-gray-400">{usd(w.fee)}</span>,
              },
              {
                key: "net",
                header: "Net",
                cell: (w) => <span className="text-emerald-400">{usd(w.netAmount)}</span>,
              },
              {
                key: "requested",
                header: "Requested",
                cell: (w) => <span className="text-gray-400">{formatDistanceToNow(w.createdAt, { addSuffix: true })}</span>,
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
