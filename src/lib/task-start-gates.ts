import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { countryOfIp } from "@/lib/geo";
import { clientIp } from "@/lib/rate-limit";
import { getFraudConfig, isVpnIp, accountsOnIp } from "@/lib/fraud";
import { addFraudRisk } from "@/lib/fraud-risk";
import { accountsOnDevice, flagOnce, readDevice, recordDevice } from "@/lib/device";
import { getEffectivePackage } from "@/lib/packages";
import {
  getActiveMissionForUser,
  buildDailyProgress,
  resolveTaskTypeBucket,
} from "@/lib/daily-mission-progress";

/**
 * The start-of-task gates shared by every route that opens a submission
 * (/api/tasks/[id]/start and /api/article-tasks/[taskId]/start). They lived
 * only in the first, so starting an ARTICLE task skipped the VPN, device and
 * per-IP checks and the plan's daily allowance. Returns a response to send
 * back, or null to carry on.
 */
export async function taskStartFraudGate(
  request: NextRequest,
  userId: string
): Promise<NextResponse | null> {
  // ── Anti-fraud gate (all admin-toggleable) ──────────────────────────────
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent");
  const fraud = await getFraudConfig();
  // Record the most-recent IP (best-effort) for the per-IP account cap.
  if (ip && ip !== "unknown") {
    void prisma.user
      .update({ where: { id: userId }, data: { lastIp: ip, lastCountry: countryOfIp(ip) } })
      .catch(() => {});
  }
  // VPN/proxy block (best-effort heuristic).
  // One offence per user per day: every retry of a blocked start used to
  // write another event, and now each one would also add risk.
  const today = new Date().toISOString().slice(0, 10);
  if (isVpnIp(ip, fraud)) {
    await addFraudRisk({
      userId: userId,
      signal: "VPN_DETECTED",
      dedupeKey: `vpn:${userId}:${today}`,
      ipAddress: ip,
      userAgent: ua,
    });
    return NextResponse.json(
      {
        error:
          "Please turn off your VPN/proxy to work on tasks.",
        code: "VPN_BLOCKED",
      },
      { status: 403 }
    );
  }
  // Accounts per DEVICE — the real multi-account signal. Several accounts
  // working from one browser is what account farming looks like; it adds
  // fraud risk (once a day) and, by default, stops the task.
  const seen = await readDevice();
  void recordDevice(userId, { ...seen, ip: ip && ip !== "unknown" ? ip : seen.ip });
  if (fraud.maxAccountsPerDevice > 0 && seen.deviceId) {
    const n = await accountsOnDevice(seen.deviceId);
    if (n > fraud.maxAccountsPerDevice) {
      await addFraudRisk({
        userId: userId,
        signal: "MULTIPLE_ACCOUNTS",
        dedupeKey: `multidev:${userId}:${today}`,
        ipAddress: ip,
        userAgent: ua,
        details: { accountsOnDevice: n, cap: fraud.maxAccountsPerDevice, deviceId: seen.deviceId },
      });
      if (fraud.deviceLimitAction === "block") {
        return NextResponse.json(
          {
            error: `This device is used by ${n} accounts — the limit is ${fraud.maxAccountsPerDevice}. Work from your own account on your own device.`,
            code: "DEVICE_LIMIT",
          },
          { status: 403 }
        );
      }
    }
  }

  // Accounts per IP. A home or office WiFi puts many honest people behind
  // one IP, so by default ("flag") this is recorded once a day for review
  // and adds NO fraud risk — with risk points, a 20-person office would
  // have been auto-suspended in ten days. "block" refuses, as it used to.
  if (fraud.maxUsersPerIp > 0) {
    const n = await accountsOnIp(ip, userId);
    if (n >= fraud.maxUsersPerIp) {
      if (fraud.ipLimitAction === "block") {
        await addFraudRisk({
          userId: userId,
          signal: "MULTIPLE_ACCOUNTS",
          dedupeKey: `multiacct:${userId}:${today}`,
          ipAddress: ip,
          userAgent: ua,
          details: { accountsOnIp: n + 1, cap: fraud.maxUsersPerIp },
        });
        return NextResponse.json(
          {
            error:
              "Too many accounts are working from this network. Only a limited number are allowed per connection.",
            code: "IP_LIMIT",
          },
          { status: 403 }
        );
      }
      await flagOnce(`ipflag:${userId}:${today}`, {
        userId: userId,
        eventType: "SHARED_IP",
        ipAddress: ip,
        userAgent: ua,
        details: { accountsOnIp: n + 1, cap: fraud.maxUsersPerIp, note: "review only — shared WiFi is normal" },
      });
    }
  }
  return null;
}

/** Daily mission allowance + the plan's tasks-per-day cap. */
export async function taskStartPlanGate(
  userId: string,
  task: { type: string; boardId: string | null },
  userPackage: Awaited<ReturnType<typeof getEffectivePackage>>,
  dayStart: Date
): Promise<NextResponse | null> {
  // Daily-mission cap: the user's daily mission defines their per-type task
  // allowance. A type not in the mission, or one whose target is already met,
  // is upgrade-gated. Only applies when an active qualifying mission exists.
  const mission = await getActiveMissionForUser(userId);
  if (mission && mission.items.length > 0) {
    const bucket = task.boardId ? "BOARD" : resolveTaskTypeBucket(task.type);
    const item = mission.items.find(
      (it) => resolveTaskTypeBucket(it.taskType) === bucket
    );
    if (!item) {
      return NextResponse.json(
        {
          error:
            "This task isn't part of your daily mission. Upgrade your plan to unlock more tasks.",
          code: "UPGRADE_REQUIRED",
        },
        { status: 403 }
      );
    }
    const countByType = await buildDailyProgress(
      userId,
      mission.items
    );
    if ((countByType[bucket] ?? 0) >= item.targetCount) {
      return NextResponse.json(
        {
          error: `You've finished today's ${task.type.toLowerCase()} tasks in your daily mission. Upgrade your plan for more.`,
          code: "UPGRADE_REQUIRED",
        },
        { status: 403 }
      );
    }
  }

  // Plan-level dailyTaskLimit (across all tasks today).
  if (userPackage && userPackage.dailyTaskLimit !== -1) {
    const totalToday = await prisma.taskSubmission.count({
      where: {
        userId: userId,
        createdAt: { gte: dayStart },
        status: { in: ["APPROVED", "AUTO_APPROVED", "PENDING"] },
      },
    });
    if (totalToday >= userPackage.dailyTaskLimit) {
      return NextResponse.json(
        {
          error: `Daily task limit reached for your plan (${userPackage.dailyTaskLimit}/day).`,
        },
        { status: 400 }
      );
    }
  }
  return null;
}
