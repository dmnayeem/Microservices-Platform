import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { isWebPushConfigured, webPushToUsers } from "@/lib/notify";

/**
 * POST /api/push/test — "Send test notification" on Settings → Notifications.
 * Sends one push to the signed-in member's own devices, through the same
 * sender (and the same switches) as every real notification, so a test that
 * arrives proves the real ones will. Carries the unread count, so it also sets
 * the number on the app icon where the device supports it.
 */
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = rateLimit(`push-test:${userId}`, 5, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many tests. Try again in ${limit.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }
  if (!isWebPushConfigured()) {
    return NextResponse.json({ error: "Push notifications aren't set up on this site yet." }, { status: 503 });
  }

  const [devices, user] = await Promise.all([
    prisma.pushSubscription.count({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { pushNotifications: true } }),
  ]);
  if (devices === 0) {
    return NextResponse.json(
      { error: "No device is signed up for notifications yet. Tap “Turn on” first." },
      { status: 409 }
    );
  }
  if (!user?.pushNotifications) {
    return NextResponse.json(
      { error: "Push notifications are switched off for your account. Turn the switch on first." },
      { status: 409 }
    );
  }

  const r = await webPushToUsers([userId], {
    title: "Test notification",
    body: "Notifications work on this device. New tasks and rewards will show up here.",
    url: "/settings#notifications",
  });
  if (r.delivered === 0) {
    return NextResponse.json(
      { error: "The test couldn't be delivered. Tap “Turn on” again to re-connect this device." },
      { status: 502 }
    );
  }
  return NextResponse.json({ success: true, devices: r.devices, delivered: r.delivered });
}
