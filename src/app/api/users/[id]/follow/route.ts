import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@/generated/prisma/client";
import { rateLimit } from "@/lib/rate-limit";

/** Repeat follow/unfollow toggles notify the target at most once per window. */
const FOLLOW_NOTIFY_WINDOW_MS = 24 * 60 * 60_000;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: targetId } = await params;
  const me = session.user.id;

  // Per account: follow/unfollow each write three rows (and a notification),
  // so a toggling script was a cheap way to spam a target and churn counters.
  const rl = rateLimit(`follow:${me}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many follow changes. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  if (me === targetId) {
    return NextResponse.json({ error: "Can't follow yourself" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, status: true, name: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.status !== "ACTIVE") {
    return NextResponse.json({ error: "User is not active" }, { status: 400 });
  }

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: me, followingId: targetId } },
  });

  if (existing) {
    // Unfollow
    await prisma.$transaction([
      prisma.follow.delete({ where: { id: existing.id } }),
      prisma.user.update({
        where: { id: me },
        data: { followingCount: { decrement: 1 } },
      }),
      prisma.user.update({
        where: { id: targetId },
        data: { followersCount: { decrement: 1 } },
      }),
    ]);
    const counts = await prisma.user.findUnique({
      where: { id: targetId },
      select: { followersCount: true },
    });
    return NextResponse.json({
      following: false,
      followersCount: counts?.followersCount ?? 0,
    });
  }

  // Follow
  const [meUser, recentlyNotified] = await Promise.all([
    prisma.user.findUnique({
      where: { id: me },
      select: { name: true, username: true },
    }),
    // Unfollow → follow again must not ping the target a second time.
    prisma.notification.findFirst({
      where: {
        userId: targetId,
        type: NotificationType.SOCIAL,
        createdAt: { gte: new Date(Date.now() - FOLLOW_NOTIFY_WINDOW_MS) },
        data: { path: ["followerId"], equals: me },
      },
      select: { id: true },
    }),
  ]);
  await prisma.$transaction([
    prisma.follow.create({
      data: { followerId: me, followingId: targetId },
    }),
    prisma.user.update({
      where: { id: me },
      data: { followingCount: { increment: 1 } },
    }),
    prisma.user.update({
      where: { id: targetId },
      data: { followersCount: { increment: 1 } },
    }),
    ...(recentlyNotified
      ? []
      : [
          prisma.notification.create({
            data: {
              userId: targetId,
              type: NotificationType.SOCIAL,
              title: "New follower",
              message: `${meUser?.name ?? meUser?.username ?? "Someone"} started following you.`,
              data: { followerId: me },
            },
          }),
        ]),
  ]);

  const counts = await prisma.user.findUnique({
    where: { id: targetId },
    select: { followersCount: true },
  });
  return NextResponse.json({
    following: true,
    followersCount: counts?.followersCount ?? 0,
  });
}
