import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getXpRank } from "@/lib/user-rank";
import { getPointsPerUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";

// GET /api/users/[id]/profile — public profile data, honors privacy settings.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      coverPhoto: true,
      bio: true,
      country: true,
      tags: true,
      level: true,
      xp: true,
      totalEarnings: true,
      isBlueVerified: true,
      verifiedBadgeStyle: true,
      package: { select: { slug: true, name: true } },
      status: true,
      privacyAvatar: true,
      privacyBio: true,
      privacyStats: true,
      privacyEarnings: true,
      privacyLocation: true,
      followersCount: true,
      followingCount: true,
      displayFollowersBoost: true,
      displayFollowingBoost: true,
      displayPostsBoost: true,
      createdAt: true,
      _count: {
        select: {
          taskSubmissions: true,
          referrals: true,
        },
      },
    },
  });

  if (!u) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const isMe = u.id === session.user.id;

  // Is the viewer following this user?
  let isFollowing = false;
  let isFollowedBy = false;
  if (!isMe) {
    const [f1, f2] = await Promise.all([
      prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: session.user.id,
            followingId: u.id,
          },
        },
        select: { id: true },
      }),
      prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: u.id,
            followingId: session.user.id,
          },
        },
        select: { id: true },
      }),
    ]);
    isFollowing = !!f1;
    isFollowedBy = !!f2;
  }

  // Privacy gates
  const showByPrivacy = (level: string): boolean => {
    if (isMe) return true;
    if (level === "PUBLIC") return true;
    if (level === "PRIVATE") return false;
    if (level === "FRIENDS") return isFollowing && isFollowedBy; // mutual
    return true;
  };

  const postsCount = await prisma.post.count({
    where: { userId: u.id, isPublic: true },
  });

  const statsVisible = showByPrivacy(u.privacyStats);
  const earningsVisible = showByPrivacy(u.privacyEarnings);

  let lifetime: {
    totalEarnedPoints: number | null;
    totalEarnedUsd: number | null;
    tasksCompleted: number;
    rank: number;
    totalXp: number;
    level: number;
    team: number;
  } | null = null;
  const pointsPerUsd = await getPointsPerUsd();
  if (statsVisible) {
    lifetime = {
      // Earnings tile respects the separate privacyEarnings setting — when
      // private, the totals are nulled but rank/xp/level/team stay visible.
      totalEarnedPoints: earningsVisible
        ? Math.round(toNum(u.totalEarnings) * pointsPerUsd)
        : null,
      totalEarnedUsd: earningsVisible ? toNum(u.totalEarnings) : null,
      tasksCompleted: u._count.taskSubmissions,
      rank: await getXpRank(u.id, u.xp),
      totalXp: u.xp,
      level: u.level,
      team: u._count.referrals,
    };
  }

  return NextResponse.json({
    user: {
      id: u.id,
      name: u.name,
      username: u.username,
      avatar: showByPrivacy(u.privacyAvatar) ? u.avatar : null,
      coverPhoto: u.coverPhoto,
      bio: showByPrivacy(u.privacyBio) ? u.bio : null,
      country: showByPrivacy(u.privacyLocation) ? u.country : null,
      tags: u.tags,
      level: u.level,
      isBlueVerified: u.isBlueVerified,
      verifiedBadgeStyle: u.verifiedBadgeStyle ?? "BLUE",
      packageTier: u.package?.slug ?? "default",
      createdAt: u.createdAt,
      // Stats — gated by privacyStats. Display = max(0, real + admin boost).
      postsCount: statsVisible
        ? Math.max(0, postsCount + u.displayPostsBoost)
        : null,
      followersCount: statsVisible
        ? Math.max(0, u.followersCount + u.displayFollowersBoost)
        : null,
      followingCount: statsVisible
        ? Math.max(0, u.followingCount + u.displayFollowingBoost)
        : null,
      lifetime,
    },
    viewer: {
      isMe,
      isFollowing,
      isFollowedBy,
    },
  });
}
