import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getXpRank } from "@/lib/user-rank";
import {
  canSee,
  visibleTo,
  type PrivacyLevel,
} from "@/lib/profile-privacy";
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

  // Prisma Accelerate's typing collapses a select this wide once a nested
  // relation is added, so the shape is restated here rather than inferred —
  // the same cast the other wide selects in this codebase use.
  type PublicRow = {
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
    dateOfBirth: Date | null;
    bloodGroup: string | null;
    maritalStatus: string | null;
    studyLevel: string | null;
    timezone: string | null;
    city: string | null;
    district: string | null;
    socialAccounts: Array<{
      id: string;
      platform: string;
      username: string;
      url: string | null;
      verified: boolean;
    }>;
    level: number;
    xp: number;
    totalEarnings: number;
    isBlueVerified: boolean;
    verifiedBadgeStyle: string | null;
    package: { slug: string; name: string } | null;
    status: string;
    privacyAvatar: string;
    privacyBio: string;
    privacyStats: string;
    privacyEarnings: string;
    privacyLocation: string;
    privacyFields: unknown;
    followersCount: number;
    followingCount: number;
    displayFollowersBoost: number;
    displayFollowingBoost: number;
    displayPostsBoost: number;
    createdAt: Date;
    _count: {
      taskSubmissions: number;
      referrals: number;
      marketplaceListings: number;
    };
  };
  const u = (await prisma.user.findUnique({
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
      // Public "about" facts. Everything here is something a person chooses to
      // publish about themselves — what they do, what they speak. Email, phone,
      // date of birth, national ID and street address are deliberately NOT in
      // this select: they are on the owner's page only, and a public endpoint
      // should not be able to leak them by a later careless spread.
      profession: true,
      nationality: true,
      language: true,
      gender: true,
      dateOfBirth: true,
      bloodGroup: true,
      maritalStatus: true,
      studyLevel: true,
      timezone: true,
      // Coarse location only. `city` and `district` say roughly where somebody
      // is; `street` and `postalCode` say which door to knock on, so they are
      // not selected at all — same reasoning as email and phone.
      city: true,
      district: true,
      socialAccounts: {
        select: {
          id: true,
          platform: true,
          username: true,
          url: true,
          verified: true,
        },
        orderBy: { connectedAt: "asc" },
      },
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
      privacyFields: true,
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
          // What this person offers publicly — the reason a stranger would look
          // them up at all.
          marketplaceListings: true,
        },
      },
    },
  })) as unknown as PublicRow | null;

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

  // Privacy gates.
  //
  // `showByPrivacy` takes a level (the five legacy columns); `show` takes a
  // FIELD KEY and resolves its level itself, covering everything else through
  // `User.privacyFields`. Both end at the same `canSee`, so "Followers" means
  // mutual in one place, not two.
  const viewerCtx = { isMe, isMutual: isFollowing && isFollowedBy };
  const showByPrivacy = (level: string): boolean =>
    canSee((level as PrivacyLevel) ?? "PUBLIC", viewerCtx);
  const show = (key: string): boolean => visibleTo(u, key, viewerCtx);

  const postsCount = await prisma.post.count({
    where: { userId: u.id, isPublic: true },
  });
  // Course authorship is not a User relation, so it needs its own count.
  const coursesCreated = await prisma.course.count({
    where: { createdById: u.id, status: "PUBLISHED" },
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
      // Each of these is now the user's call — see lib/profile-privacy.ts.
      profession: show("profession") ? u.profession : null,
      nationality: show("nationality") ? u.nationality : null,
      language: show("language") ? u.language : null,
      gender: show("gender") ? u.gender : null,
      dateOfBirth: show("dateOfBirth") ? u.dateOfBirth : null,
      bloodGroup: show("bloodGroup") ? u.bloodGroup : null,
      maritalStatus: show("maritalStatus") ? u.maritalStatus : null,
      studyLevel: show("studyLevel") ? u.studyLevel : null,
      timezone: show("timezone") ? u.timezone : null,
      // City and district ride with the country, behind the same
      // `privacyLocation` switch — one setting for "where I am", not three.
      city: showByPrivacy(u.privacyLocation) ? u.city : null,
      district: showByPrivacy(u.privacyLocation) ? u.district : null,
      // Connected accounts are the point of connecting them — a stranger
      // deciding whether to follow or buy wants to see them. Gated behind the
      // same switch as the rest of the profile detail.
      // These used to ride on the bio switch, which meant hiding your bio also
      // hid your linked accounts — two unrelated decisions on one control.
      socialAccounts: show("socialAccounts") ? u.socialAccounts : [],
      creations: show("creations")
        ? {
            coursesCreated,
            marketplaceListings: u._count.marketplaceListings,
          }
        : { coursesCreated: 0, marketplaceListings: 0 },
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
