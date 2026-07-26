import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { sendNotificationEmail, isSmtpConfigured } from "@/lib/email";
import { getPointsPerUsd } from "@/lib/economy";
import { z } from "zod";

// Bulk action schema
const bulkActionSchema = z.object({
  action: z.enum(["ban", "delete", "unban", "sendEmail", "adjustPoints", "changeTier"]),
  ids: z.array(z.string()).min(1).max(500),
  reason: z.string().optional(),
  // sendEmail
  subject: z.string().max(160).optional(),
  message: z.string().max(4000).optional(),
  // adjustPoints
  points: z.number().int().optional(),
  // changeTier
  packageId: z.string().optional(),
});

// POST /api/admin/users/bulk - Apply a bulk action to selected users
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    const adminId = session.user.id;

    const body = await request.json();
    const validation = bulkActionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { action, ids, reason, subject, message, points, packageId } = validation.data;

    // Permission check per action
    if (action === "ban" || action === "unban") {
      if (!hasPermission(adminRole, "users.ban")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (action === "delete") {
      if (!hasPermission(adminRole, "users.delete")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (!hasPermission(adminRole, "users.edit")) {
      // sendEmail / adjustPoints / changeTier
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Never let admin act on themselves
    const targetIds = ids.filter((id) => id !== adminId);
    if (targetIds.length === 0) {
      return NextResponse.json(
        { error: "Cannot act on yourself" },
        { status: 400 }
      );
    }

    // Apply the action
    if (action === "ban") {
      await prisma.user.updateMany({
        where: { id: { in: targetIds } },
        data: { status: "BANNED" },
      });
    } else if (action === "unban") {
      await prisma.user.updateMany({
        where: { id: { in: targetIds } },
        data: { status: "ACTIVE" },
      });
    } else if (action === "delete") {
      // Soft delete: mark banned + suspended
      await prisma.user.updateMany({
        where: { id: { in: targetIds } },
        data: { status: "BANNED" },
      });
    } else if (action === "sendEmail") {
      if (!subject || !message) {
        return NextResponse.json({ error: "Subject and message required" }, { status: 400 });
      }
      if (isSmtpConfigured()) {
        const recipients = await prisma.user.findMany({
          where: {
            id: { in: targetIds },
            emailNotifications: true,
            email: { not: { endsWith: "@deleted.local" } },
          },
          select: { email: true },
        });
        const emails = recipients.map((r) => r.email).filter((e): e is string => !!e);
        for (let i = 0; i < emails.length; i += 40) {
          await Promise.allSettled(
            emails.slice(i, i + 40).map((email) =>
              sendNotificationEmail(email, subject, message)
            )
          );
        }
      }
    } else if (action === "adjustPoints") {
      if (!Number.isInteger(points) || points === 0) {
        return NextResponse.json({ error: "Non-zero integer points required" }, { status: 400 });
      }
      const delta = points as number;
      const pointsPerUsd = await getPointsPerUsd();
      for (const uid of targetIds) {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: uid },
            data: {
              pointsBalance: { increment: delta },
              ...(delta > 0 ? { totalEarnings: { increment: delta / pointsPerUsd } } : {}),
            },
          }),
          prisma.transaction.create({
            data: {
              userId: uid,
              type: delta > 0 ? TransactionType.BONUS : TransactionType.PENALTY,
              status: TransactionStatus.COMPLETED,
              points: delta,
              amount: delta / pointsPerUsd,
              description: reason || `Admin ${delta > 0 ? "credit" : "debit"}`,
              // Repeatable admin action — key per-occurrence so two same-size
              // adjustments to one user don't collide on the (userId, reference)
              // unique (batch-size was collision-prone).
              reference: `admin_adjust_${uid}_${Date.now()}`,
            },
          }),
        ]);
      }
    } else if (action === "changeTier") {
      if (!packageId) {
        return NextResponse.json({ error: "packageId required" }, { status: 400 });
      }
      const pkg = await prisma.package.findUnique({ where: { id: packageId }, select: { id: true } });
      if (!pkg) {
        return NextResponse.json({ error: "Package not found" }, { status: 400 });
      }
      await prisma.user.updateMany({
        where: { id: { in: targetIds } },
        data: { packageId },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: `BULK_${action.toUpperCase()}`,
        entity: "User",
        newData: { ids: targetIds, reason: reason ?? null, count: targetIds.length },
      },
    });

    return NextResponse.json({
      success: true,
      affected: targetIds.length,
    });
  } catch (error) {
    console.error("Error in bulk user action:", error);
    return NextResponse.json(
      { error: "Failed to apply bulk action" },
      { status: 500 }
    );
  }
}
