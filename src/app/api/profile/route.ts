import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  changedTargetingFields,
  normalizeGender,
  parseDateOfBirth,
  TARGETING_CHANGE_COOLDOWN_DAYS,
  TARGETING_CHANGE_COOLDOWN_MS,
} from "@/lib/profile-targeting";
import { KYCStatus } from "@/generated/prisma";
import { calculateProfileCompletion } from "@/lib/profile-completion";
import { getXpRank, calculateXpForLevel } from "@/lib/user-rank";
import { getPointsPerUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";
import { checkUsername, USERNAME_RULE_MESSAGE } from "@/lib/username";
import { getUserDayContext } from "@/lib/user-day";

const PROFILE_FIELDS = {
  id: true,
  name: true,
  username: true,
  email: true,
  avatar: true,
  coverPhoto: true,
  bio: true,
  phone: true,
  country: true,
  language: true,
  timezone: true,
  level: true,
  xp: true,
  pointsBalance: true,
  cashBalance: true,
  totalEarnings: true,
  package: { select: { id: true, slug: true, name: true, features: true, dailyTaskLimit: true } },
  packageExpiresAt: true,
  referralCode: true,
  kycStatus: true,
  emailVerified: true,
  phoneVerified: true,
  isBlueVerified: true,
  verifiedBadgeStyle: true,
  twoFactorEnabled: true,
  notificationsEnabled: true,
  emailNotifications: true,
  pushNotifications: true,
  // Extended profile
  firstName: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  nidNumber: true,
  profession: true,
  maritalStatus: true,
  studyLevel: true,
  nationality: true,
  bloodGroup: true,
  secondaryEmail: true,
  secondaryPhone: true,
  // Address
  street: true,
  village: true,
  city: true,
  subDistrict: true,
  district: true,
  subDivision: true,
  division: true,
  region: true,
  postalCode: true,
  // Settings
  theme: true,
  themeAccent: true,
  tags: true,
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
} as const;

// GET /api/profile - Get user's full profile
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        ...PROFILE_FIELDS,
        _count: {
          select: {
            referrals: true,
            taskSubmissions: true,
            transactions: true,
            socialAccounts: true,
            posts: true,
            courseEnrollments: true,
            marketplaceListings: true,
            marketplacePurchases: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    type CountRel = {
      _count: {
        referrals: number;
        taskSubmissions: number;
        transactions: number;
        socialAccounts: number;
        posts: number;
        courseEnrollments: number;
        marketplaceListings: number;
        marketplacePurchases: number;
      };
    };
    const u = user as typeof user & CountRel;

    // Auxiliary stats. These are NON-critical: if any one sub-query fails (e.g. a
    // subsystem's table/column is momentarily out of sync), the profile must still
    // load with core identity + stats rather than 500. Each degrades to a safe default.
    const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch (e) {
        console.error("Profile aux query failed (degraded):", e);
        return fallback;
      }
    };

    // Counts that aren't direct User relations
    const [coursesCreatedCount, marketplaceSalesCount, marketplaceTotalSalesAmount] =
      await Promise.all([
        safe(
          prisma.course.count({ where: { createdById: session.user.id } }),
          0
        ),
        safe(
          prisma.marketplacePurchase.count({
            where: { listing: { sellerId: session.user.id } },
          }),
          0
        ),
        safe(
          prisma.marketplacePurchase.aggregate({
            where: { listing: { sellerId: session.user.id }, status: "COMPLETED" },
            _sum: { sellerAmount: true },
          }),
          { _sum: { sellerAmount: null } }
        ),
      ]);

    const pkg = u.package;

    const xpForNextLevel = calculateXpForLevel(u.level + 1);
    const xpProgress = u.xp - calculateXpForLevel(u.level);
    const xpNeeded = Math.max(1, xpForNextLevel - calculateXpForLevel(u.level));

    const achievementsCount = await safe(
      prisma.userAchievement.count({ where: { userId: session.user.id } }),
      0
    );

    // Social-earning points = sum of what this user's posts have earned from
    // engagement (Post.socialEarnings, credited in lib/social-earning.ts).
    const socialEarnAgg = await safe(
      prisma.post.aggregate({
        where: { userId: session.user.id },
        _sum: { socialEarnings: true },
      }),
      { _sum: { socialEarnings: null } }
    );
    const socialEarningsPoints = socialEarnAgg._sum.socialEarnings ?? 0;
    const pointsPerUsd = await getPointsPerUsd();

    // The user's LOCAL midnight — the same boundary daily limits, the daily
    // mission and the tasks-hub summary use. This route was the only one on
    // server-local midnight, so "Completed Today" here and on the tasks hub
    // could disagree while sitting side by side on the same screen.
    const { startOfDayUtc: todayStart } = await getUserDayContext(session.user.id);

    const todaySubmissions = await safe(
      prisma.taskSubmission.findMany({
        where: {
          userId: session.user.id,
          createdAt: { gte: todayStart },
          status: { in: ["APPROVED", "AUTO_APPROVED"] },
        },
        select: { pointsEarned: true, xpEarned: true },
      }),
      [] as { pointsEarned: number | null; xpEarned: number | null }[]
    );

    const todayStats = {
      count: todaySubmissions.length,
      pointsEarned: todaySubmissions.reduce((sum, s) => sum + (s.pointsEarned || 0), 0),
      xpEarned: todaySubmissions.reduce((sum, s) => sum + (s.xpEarned || 0), 0),
    };

    const socialAccounts = await safe(
      prisma.socialAccount.findMany({
        where: { userId: session.user.id },
        orderBy: { connectedAt: "asc" },
      }),
      []
    );

    // XP rank — also non-critical; default to 0 (unranked) on failure.
    const xpRank = await safe(getXpRank(u.id, u.xp), 0);

    const completion = calculateProfileCompletion({
      avatar: u.avatar,
      coverPhoto: u.coverPhoto,
      firstName: u.firstName,
      lastName: u.lastName,
      bio: u.bio,
      gender: u.gender,
      dateOfBirth: u.dateOfBirth,
      nidNumber: u.nidNumber,
      emailVerified: u.emailVerified,
      phone: u.phone,
      phoneVerified: u.phoneVerified,
      country: u.country,
      city: u.city,
      street: u.street,
      postalCode: u.postalCode,
      kycStatus: u.kycStatus,
      tags: u.tags,
      socialAccountsCount: u._count.socialAccounts,
    });

    return NextResponse.json({
      profile: {
        id: u.id,
        name: u.name,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        avatar: u.avatar,
        coverPhoto: u.coverPhoto,
        bio: u.bio,
        phone: u.phone,
        secondaryEmail: u.secondaryEmail,
        secondaryPhone: u.secondaryPhone,
        gender: u.gender,
        dateOfBirth: u.dateOfBirth,
        nidNumber: u.nidNumber,
        profession: u.profession,
        maritalStatus: u.maritalStatus,
        studyLevel: u.studyLevel,
        nationality: u.nationality,
        bloodGroup: u.bloodGroup,
        country: u.country,
        language: u.language || "en",
        timezone: u.timezone || "UTC",
        tags: u.tags ?? [],
        createdAt: u.createdAt,
      },
      address: {
        street: u.street,
        village: u.village,
        city: u.city,
        subDistrict: u.subDistrict,
        district: u.district,
        subDivision: u.subDivision,
        division: u.division,
        region: u.region,
        postalCode: u.postalCode,
        country: u.country,
      },
      stats: {
        level: u.level,
        xp: u.xp,
        xpProgress,
        xpNeeded,
        xpPercentage: Math.round((xpProgress / xpNeeded) * 100),
        pointsBalance: u.pointsBalance,
        cashBalance: toNum(u.cashBalance),
        totalEarnings: toNum(u.totalEarnings),
        tasksCompleted: u._count.taskSubmissions,
        referralsCount: u._count.referrals,
        achievementsCount,
        socialAccountsCount: u._count.socialAccounts,
        // Display = max(0, real + admin-set boost). Admin boost can be negative.
        postsCount: Math.max(0, u._count.posts + u.displayPostsBoost),
        followersCount: Math.max(0, u.followersCount + u.displayFollowersBoost),
        followingCount: Math.max(0, u.followingCount + u.displayFollowingBoost),
        coursesEnrolled: u._count.courseEnrollments,
        coursesCreated: coursesCreatedCount,
        marketplaceListings: u._count.marketplaceListings,
        marketplacePurchases: u._count.marketplacePurchases,
        marketplaceSales: marketplaceSalesCount,
        marketplaceSalesAmount: toNum(marketplaceTotalSalesAmount._sum.sellerAmount),
        socialEarningsPoints,
        socialEarningsUsd: socialEarningsPoints / pointsPerUsd,
        lifetime: {
          totalEarnedPoints: Math.round(toNum(u.totalEarnings) * pointsPerUsd),
          totalEarnedUsd: toNum(u.totalEarnings),
          tasksCompleted: u._count.taskSubmissions,
          rank: xpRank,
          totalXp: u.xp,
          level: u.level,
          team: u._count.referrals,
        },
      },
      package: {
        tier: pkg?.slug ?? "default",
        name: pkg?.name ?? "Free",
        expiresAt: u.packageExpiresAt,
        features: pkg?.features || [],
        dailyTaskLimit: pkg?.dailyTaskLimit || 10,
      },
      referral: {
        code: u.referralCode,
        link: `${process.env.NEXT_PUBLIC_APP_URL || "https://earngpt.app"}/register?ref=${u.referralCode}`,
      },
      verification: {
        kycStatus: u.kycStatus,
        isBlueVerified: u.isBlueVerified,
        verifiedBadgeStyle: u.verifiedBadgeStyle ?? "BLUE",
        isEmailVerified: !!u.emailVerified,
        isPhoneVerified: !!u.phoneVerified,
        twoFactorEnabled: u.twoFactorEnabled,
        isFullyVerified:
          u.kycStatus === KYCStatus.APPROVED &&
          !!u.emailVerified &&
          !!u.phoneVerified,
      },
      preferences: {
        theme: u.theme,
        themeAccent: u.themeAccent ?? "indigo",
        notifications: {
          enabled: u.notificationsEnabled,
          email: u.emailNotifications,
          push: u.pushNotifications,
        },
        privacy: {
          avatar: u.privacyAvatar,
          bio: u.privacyBio,
          stats: u.privacyStats,
          earnings: u.privacyEarnings,
          location: u.privacyLocation,
        },
      },
      socialAccounts: socialAccounts.map((s) => ({
        id: s.id,
        platform: s.platform,
        username: s.username,
        url: s.url,
        followers: s.followers,
        following: s.following,
        postsCount: s.postsCount,
        verified: s.verified,
        connectedAt: s.connectedAt,
      })),
      completion,
      todayStats: {
        tasksCompleted: todayStats.count,
        pointsEarned: todayStats.pointsEarned,
        xpEarned: todayStats.xpEarned,
      },
      // legacy alias kept for back-compat
      todayActivity: {
        tasksCompleted: todayStats.count,
        pointsEarned: todayStats.pointsEarned,
        xpEarned: todayStats.xpEarned,
      },
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        error: "Failed to fetch profile",
        ...(isDev && error instanceof Error
          ? { detail: error.message, stack: error.stack?.split("\n").slice(0, 6).join("\n") }
          : {}),
        hint:
          "If you just changed prisma/schema.prisma, restart the dev server " +
          "(`npm run dev`) so the regenerated Prisma client is loaded. Also confirm " +
          "`npx prisma db push` printed 'in sync'.",
      },
      { status: 500 }
    );
  }
}

const ALLOWED_PRIVACY = new Set(["PUBLIC", "FRIENDS", "PRIVATE"]);
const ALLOWED_TAGS = new Set([
  "EARLY_ADOPTER",
  "VERIFIED",
  "CRYPTO",
  "TRADER",
  "GAMER",
  "INFLUENCER",
  "WHALE",
  "PRO",
  "ELITE",
  "CREATOR",
]);

// PATCH /api/profile - Update user profile (covers all editable fields)
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    // Basic
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 50) {
        return NextResponse.json({ error: "Name must be 2-50 characters" }, { status: 400 });
      }
      updateData.name = name;
    }
    // `gender` is NOT in this list: it is a targeting dimension and must be one
    // of the three canonical values, not free text. See below.
    for (const f of [
      "firstName",
      "lastName",
      "bio",
      "profession",
      "maritalStatus",
      "studyLevel",
      "nationality",
      "bloodGroup",
      "secondaryEmail",
      "secondaryPhone",
      "nidNumber",
    ] as const) {
      if (body[f] !== undefined) {
        const val = body[f] === null ? null : String(body[f]).trim();
        if (typeof val === "string" && val.length > 200) {
          return NextResponse.json({ error: `${f} too long` }, { status: 400 });
        }
        updateData[f] = val || null;
      }
    }

    // Username — a URL-safe, unique handle used in profile links (/u/<username>).
    if (body.username !== undefined) {
      const raw =
        body.username === null
          ? null
          : String(body.username).trim().replace(/^@+/, "");
      if (!raw) {
        // Removing a handle silently breaks the user's own /u/<name> link and
        // makes them un-mentionable. Refuse — but only if they actually have
        // one, so accounts still awaiting the backfill can save their profile.
        const cur = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { username: true },
        });
        if (cur?.username) {
          return NextResponse.json(
            {
              error:
                "Your username can't be removed — pick a different one instead.",
            },
            { status: 400 }
          );
        }
        // No handle now and none supplied: nothing to do.
      } else if (checkUsername(raw) === "INVALID") {
        return NextResponse.json(
          { error: USERNAME_RULE_MESSAGE },
          { status: 400 }
        );
      } else if (checkUsername(raw) === "RESERVED") {
        return NextResponse.json(
          { error: "That username is reserved. Please pick another." },
          { status: 400 }
        );
      } else {
        const taken = await prisma.user.findFirst({
          where: {
            username: { equals: raw, mode: "insensitive" },
            NOT: { id: session.user.id },
          },
          select: { id: true },
        });
        if (taken) {
          return NextResponse.json(
            { error: "Username already taken" },
            { status: 400 }
          );
        }
        updateData.username = raw;
      }
    }
    // Gender — normalised to MALE / FEMALE / OTHER, the same three values
    // `sanitizeTaskAudience` writes on the task side. It used to be stored as
    // whatever the user typed (up to 200 characters), and `taskAudienceWhere`
    // matches with `{ has: value }` — case-SENSITIVE — so a profile saying
    // "male" could never match a task targeting ["MALE"]. `audienceWhere()`
    // (notifications) matched case-insensitively, so one audience definition
    // selected two different populations.
    if (body.gender !== undefined) {
      updateData.gender = normalizeGender(body.gender);
    }

    if (body.dateOfBirth !== undefined) {
      // Age drives targeting, so `new Date("banana")` — an Invalid Date written
      // straight to the column — was a targeting problem, not just bad data.
      const dob = parseDateOfBirth(body.dateOfBirth);
      if (!dob.ok) {
        return NextResponse.json({ error: dob.error }, { status: 400 });
      }
      updateData.dateOfBirth = dob.value;
    }

    // Photos
    if (body.avatar !== undefined) updateData.avatar = body.avatar || null;
    if (body.coverPhoto !== undefined) updateData.coverPhoto = body.coverPhoto || null;

    // Phone (basic format check)
    if (body.phone !== undefined) {
      const phone = body.phone === null ? null : String(body.phone).trim();
      if (phone && !/^\+?[\d\s-]{8,20}$/.test(phone)) {
        return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
      }
      updateData.phone = phone || null;
      updateData.phoneVerified = null; // reset on change
    }

    // Address
    for (const f of [
      "street",
      "village",
      "city",
      "subDistrict",
      "district",
      "subDivision",
      "division",
      "region",
      "postalCode",
      "country",
    ] as const) {
      if (body[f] !== undefined) {
        updateData[f] = body[f] === null ? null : String(body[f]).trim() || null;
      }
    }

    // Settings
    if (body.language !== undefined) {
      const validLanguages = ["en", "bn", "hi", "ar", "es", "fr", "de", "zh"];
      if (!validLanguages.includes(body.language)) {
        return NextResponse.json({ error: "Invalid language code" }, { status: 400 });
      }
      updateData.language = body.language;
    }
    if (body.timezone !== undefined) updateData.timezone = body.timezone;
    if (body.theme !== undefined) {
      if (!["dark", "light", "system"].includes(body.theme)) {
        return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
      }
      updateData.theme = body.theme;
    }
    if (body.themeAccent !== undefined) {
      const validAccents = [
        "red", "orange", "amber", "yellow", "lime", "green", "emerald",
        "teal", "cyan", "sky", "blue", "indigo", "violet", "purple",
        "fuchsia", "pink", "rose", "gold", "silver",
      ];
      if (!validAccents.includes(body.themeAccent)) {
        return NextResponse.json({ error: "Invalid accent color" }, { status: 400 });
      }
      updateData.themeAccent = body.themeAccent;
    }

    // Tags
    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags)) {
        return NextResponse.json({ error: "tags must be an array" }, { status: 400 });
      }
      const cleaned = body.tags
        .map((t: unknown) => String(t).toUpperCase())
        .filter((t: string) => ALLOWED_TAGS.has(t))
        .slice(0, 3);
      updateData.tags = cleaned;
    }

    // Privacy
    for (const f of ["privacyAvatar", "privacyBio", "privacyStats", "privacyEarnings", "privacyLocation"] as const) {
      if (body[f] !== undefined) {
        const v = String(body[f]).toUpperCase();
        if (!ALLOWED_PRIVACY.has(v)) {
          return NextResponse.json({ error: `Invalid value for ${f}` }, { status: 400 });
        }
        updateData[f] = v;
      }
    }

    // Notification prefs
    if (body.notificationsEnabled !== undefined) updateData.notificationsEnabled = !!body.notificationsEnabled;
    if (body.emailNotifications !== undefined) updateData.emailNotifications = !!body.emailNotifications;
    if (body.pushNotifications !== undefined) updateData.pushNotifications = !!body.pushNotifications;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Targeting attributes get a cooldown.
    //
    // Country, region, division, district, sub-district, postal code, gender and
    // date of birth are the nine dimensions `taskAudienceWhere()` matches on, and
    // every one was freely editable with no limit and no trail. The play was:
    // set your country to match a high-paying geo-targeted task, complete it,
    // set it back — which made the whole strict-targeting system advisory.
    const current = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        country: true,
        region: true,
        division: true,
        district: true,
        subDistrict: true,
        postalCode: true,
        gender: true,
        dateOfBirth: true,
        targetingChangedAt: true,
      },
    });
    if (!current) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const targetingChanges = changedTargetingFields(current, updateData);
    if (targetingChanges.length > 0) {
      const last = current.targetingChangedAt?.getTime() ?? 0;
      const readyAt = last + TARGETING_CHANGE_COOLDOWN_MS;
      if (last > 0 && Date.now() < readyAt) {
        const daysLeft = Math.ceil((readyAt - Date.now()) / 86_400_000);
        return NextResponse.json(
          {
            error: `Your location, gender and date of birth can only be changed once every ${TARGETING_CHANGE_COOLDOWN_DAYS} days — these decide which tasks you're offered. Try again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
            fields: targetingChanges,
            readyAt: new Date(readyAt).toISOString(),
          },
          { status: 429 }
        );
      }
      updateData.targetingChangedAt = new Date();
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
    });

    // A trail, so a pattern of retargeting can be found after the fact. There
    // was none before, which is why past abuse cannot be counted.
    if (targetingChanges.length > 0) {
      await prisma.auditLog
        .create({
          data: {
            userId: session.user.id,
            action: "PROFILE_TARGETING_CHANGED",
            entity: "User",
            entityId: session.user.id,
            targetUserId: session.user.id,
            newData: JSON.parse(
              JSON.stringify({
                fields: targetingChanges,
                from: Object.fromEntries(
                  targetingChanges.map((f) => [f, current[f] ?? null])
                ),
                to: Object.fromEntries(
                  targetingChanges.map((f) => [f, updateData[f] ?? null])
                ),
              })
            ),
          },
        })
        .catch(() => {
          // Best-effort — the profile update itself already stands.
        });
    }

    return NextResponse.json({
      message: "Profile updated successfully",
      updated: Object.keys(updateData),
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}

// Self-service account deletion. Soft-deletes without a schema change: blocks
// login (status BANNED, which authorize() rejects) and anonymizes PII. Admin can
// still see the record for audit/finance. Client signs the user out afterwards.
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const id = session.user.id;
    await prisma.user.update({
      where: { id },
      data: {
        status: "BANNED",
        password: null,
        email: `deleted+${id}@deleted.local`,
        name: "Deleted User",
        username: null,
        avatar: null,
        coverPhoto: null,
        bio: null,
        phone: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}

