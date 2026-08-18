import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  sendPushToUsers,
  sendPushToAll,
  isOneSignalConfigured,
} from "@/lib/onesignal";
import { sendNotificationEmail, isSmtpConfigured } from "@/lib/email";
import { Prisma } from "@/generated/prisma/client";
import { audienceWhere, type AudienceCriteria } from "@/lib/audience";

interface SendNotificationBody {
  type: string;
  title: string;
  message: string;
  target: "all" | "package" | "specific" | "segment";
  packageFilter?: string[];
  userIds?: string[];

  // Segment criteria (legacy flat fields — kept for back-compat)
  packages?: string[];
  minLevel?: number;
  maxLevel?: number;
  country?: string;
  activeWithinDays?: number;
  minTasksCompleted?: number;
  // Full demographic/location segmentation (preferred).
  criteria?: AudienceCriteria;

  // Optional content
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  imageUrl?: string;
  actionUrl?: string;
  actionLabel?: string;
  /** ISO datetime — if set, store the notification as scheduled (no immediate send). */
  scheduledFor?: string;

  // Channels
  sendInApp?: boolean;
  sendPush?: boolean;
  sendEmail?: boolean;

  // Legacy fields kept for compatibility
  url?: string;
  data?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "notifications.send"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: SendNotificationBody = await request.json();
    const {
      type,
      title,
      message,
      target,
      packageFilter,
      userIds,
      packages,
      minLevel,
      maxLevel,
      country,
      activeWithinDays,
      minTasksCompleted,
      criteria,
      priority = "NORMAL",
      imageUrl,
      actionUrl,
      actionLabel,
      scheduledFor,
      sendInApp = true,
      sendPush,
      sendEmail,
      url,
      data,
    } = body;

    // Validate
    if (!type || !title || !message || !target) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (title.length > 50) {
      return NextResponse.json(
        { error: "Title must be 50 characters or less" },
        { status: 400 }
      );
    }
    if (message.length > 200) {
      return NextResponse.json(
        { error: "Message must be 200 characters or less" },
        { status: 400 }
      );
    }

    const validTypes = [
      "SYSTEM",
      "TASK",
      "WALLET",
      "REFERRAL",
      "PROMOTION",
      "ACHIEVEMENT",
      "LOTTERY",
      "SOCIAL",
    ];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid notification type" },
        { status: 400 }
      );
    }

    // Resolve target user IDs
    let targetUserIds: string[] = [];

    if (target === "all") {
      const users = await prisma.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      targetUserIds = users.map((u) => u.id);
    } else if (target === "package" && packageFilter?.length) {
      const users = await prisma.user.findMany({
        where: {
          status: "ACTIVE",
          package: { slug: { in: packageFilter as string[] } },
        },
        select: { id: true },
      });
      targetUserIds = users.map((u) => u.id);
    } else if (target === "specific" && userIds?.length) {
      targetUserIds = userIds;
    } else if (target === "segment") {
      // Prefer the full demographic criteria object; fall back to the legacy
      // flat fields (packages/level/country-substring/active) when absent.
      let where: Prisma.UserWhereInput;
      if (criteria && Object.keys(criteria).length > 0) {
        where = audienceWhere(criteria);
      } else {
        where = { status: "ACTIVE" };
        if (packages && packages.length > 0) {
          where.package = { slug: { in: packages as string[] } };
        }
        if (typeof minLevel === "number" && minLevel > 0) {
          where.level = { ...(where.level as object), gte: minLevel };
        }
        if (typeof maxLevel === "number" && maxLevel > 0) {
          where.level = { ...(where.level as object), lte: maxLevel };
        }
        if (country && country.trim()) {
          where.country = { contains: country.trim(), mode: "insensitive" };
        }
        if (typeof activeWithinDays === "number" && activeWithinDays > 0) {
          const since = new Date();
          since.setDate(since.getDate() - activeWithinDays);
          where.lastLoginAt = { gte: since };
        }
      }

      let users = await prisma.user.findMany({
        where,
        select: { id: true },
      });

      // Filter by min tasks completed (post-fetch for accuracy)
      if (typeof minTasksCompleted === "number" && minTasksCompleted > 0) {
        const groups = (await prisma.taskSubmission.groupBy({
          by: ["userId"],
          where: {
            status: "APPROVED",
            userId: { in: users.map((u) => u.id) },
          },
          _count: { _all: true },
        })) as unknown as Array<{ userId: string; _count: { _all: number } }>;
        const eligibleIds = new Set(
          groups
            .filter((g) => g._count._all >= minTasksCompleted)
            .map((g) => g.userId)
        );
        users = users.filter((u) => eligibleIds.has(u.id));
      }

      targetUserIds = users.map((u) => u.id);
    }

    if (targetUserIds.length === 0) {
      return NextResponse.json(
        { error: "No recipients found for the selected criteria" },
        { status: 400 }
      );
    }

    // Build notification metadata
    const notificationData: Record<string, unknown> = {
      sentBy: session.user.id,
      sentAt: new Date().toISOString(),
      targetType: target,
      priority,
      ...(imageUrl ? { imageUrl } : {}),
      ...(actionUrl ? { actionUrl } : {}),
      ...(actionLabel ? { actionLabel } : {}),
      ...(scheduledFor ? { scheduledFor } : {}),
      ...data,
    };

    // If scheduled for the future, save as scheduled (no immediate fan-out)
    if (
      scheduledFor &&
      new Date(scheduledFor).getTime() > Date.now() + 60_000
    ) {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "NOTIFICATION_SCHEDULED",
          entity: "Notification",
          newData: {
            recipientCount: targetUserIds.length,
            scheduledFor,
            type,
            title,
            message,
            target,
          } as Prisma.InputJsonValue,
        },
      });
      return NextResponse.json({
        success: true,
        scheduled: true,
        scheduledFor,
        recipientCount: targetUserIds.length,
        message: `Scheduled for ${new Date(scheduledFor).toLocaleString()} — ${targetUserIds.length} recipient(s)`,
      });
    }

    // Create in-app notifications immediately
    if (sendInApp !== false) {
      await prisma.notification.createMany({
        data: targetUserIds.map((userId) => ({
          userId,
          type: type as
            | "SYSTEM"
            | "TASK"
            | "WALLET"
            | "REFERRAL"
            | "PROMOTION"
            | "ACHIEVEMENT"
            | "LOTTERY"
            | "SOCIAL",
          title,
          message,
          data: notificationData as Prisma.InputJsonValue,
        })),
      });
    }

    // Push via OneSignal
    let pushResult = null;
    if (sendPush) {
      if (!isOneSignalConfigured()) {
        pushResult = { success: false, error: "OneSignal not configured" };
      } else if (target === "all") {
        pushResult = await sendPushToAll(
          title,
          message,
          { type, ...data },
          actionUrl ?? url
        );
      } else {
        pushResult = await sendPushToUsers(
          targetUserIds,
          title,
          message,
          { type, ...data },
          actionUrl ?? url
        );
      }
    }

    // Email channel — batched, best-effort. Skips opted-out + deleted accounts.
    let emailResult: { success: boolean; sent?: number; error?: string } | null = null;
    if (sendEmail) {
      if (!isSmtpConfigured()) {
        emailResult = { success: false, sent: 0, error: "SMTP not configured" };
      } else {
        const recipients = await prisma.user.findMany({
          where: {
            id: { in: targetUserIds },
            emailNotifications: true,
            email: { not: { endsWith: "@deleted.local" } },
          },
          select: { email: true },
        });
        const emails = recipients
          .map((r) => r.email)
          .filter((e): e is string => !!e);
        let sent = 0;
        const BATCH = 40;
        for (let i = 0; i < emails.length; i += BATCH) {
          const slice = emails.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            slice.map((email) =>
              sendNotificationEmail(email, title, message, actionUrl ?? url)
            )
          );
          sent += results.filter((r) => r.status === "fulfilled").length;
        }
        emailResult = { success: true, sent };
      }
    }

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "NOTIFICATION_SENT",
        entity: "Notification",
        newData: {
          recipientCount: targetUserIds.length,
          type,
          title,
          target,
          channels: { inApp: sendInApp, push: !!sendPush, email: !!sendEmail },
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      success: true,
      recipientCount: targetUserIds.length,
      message: `Notification sent to ${targetUserIds.length} user(s)`,
      push: sendPush
        ? {
            sent: pushResult?.success || false,
            recipients: (pushResult as { recipients?: number } | null)?.recipients,
            error: pushResult?.error,
          }
        : null,
      email: emailResult,
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    return NextResponse.json(
      { error: "Failed to send notification" },
      { status: 500 }
    );
  }
}
