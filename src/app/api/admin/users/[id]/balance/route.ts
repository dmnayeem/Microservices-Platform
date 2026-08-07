import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lt } from "@/lib/money";
import { z } from "zod";

const adjustBalanceSchema = z.object({
  type: z.enum(["points", "cash", "level", "xp"]),
  action: z.enum(["add", "deduct"]),
  amount: z.number().positive(),
  reason: z.string().optional(),
});

// POST /api/admin/users/[id]/balance - Adjust user balance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "users.adjust_balance"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const validation = adjustBalanceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { type, action, amount, reason } = validation.data;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Only a super admin may act on a super admin account.
    if (user.role === "SUPER_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only a super admin can adjust a super admin's balance" },
        { status: 403 }
      );
    }

    // Calculate the adjustment
    const adjustmentAmount = action === "add" ? amount : -amount;

    // For deduction, check if user has enough balance
    if (action === "deduct") {
      if (type === "points" && user.pointsBalance < amount) {
        return NextResponse.json(
          { error: "Insufficient points balance" },
          { status: 400 }
        );
      }
      if (type === "cash" && lt(user.cashBalance, amount)) {
        return NextResponse.json(
          { error: "Insufficient cash balance" },
          { status: 400 }
        );
      }
      if (type === "level" && user.level - amount < 1) {
        return NextResponse.json(
          { error: "Level cannot go below 1" },
          { status: 400 }
        );
      }
      if (type === "xp" && user.xp < amount) {
        return NextResponse.json(
          { error: "Insufficient XP" },
          { status: 400 }
        );
      }
    }

    // Update user balance/progression and create transaction
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        pointsBalance:
          type === "points" ? { increment: adjustmentAmount } : undefined,
        cashBalance:
          type === "cash" ? { increment: adjustmentAmount } : undefined,
        level: type === "level" ? { increment: adjustmentAmount } : undefined,
        xp: type === "xp" ? { increment: adjustmentAmount } : undefined,
      },
    });

    // Only points / cash create transactions; level + xp are progression-only
    if (type === "points" || type === "cash") {
      await prisma.transaction.create({
        data: {
          userId: id,
          type: action === "add" ? "BONUS" : "PENALTY",
          points: type === "points" ? adjustmentAmount : 0,
          amount: type === "cash" ? adjustmentAmount : 0,
          description:
            reason || `Admin ${action === "add" ? "credit" : "debit"} - ${type}`,
          status: "COMPLETED",
          metadata: {
            adminId: session.user.id,
            adminEmail: session.user.email,
            balanceType: type,
            action,
            originalAmount: amount,
          },
        },
      });
    }

    // Audit log every adjustment
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: `BALANCE_${action.toUpperCase()}_${type.toUpperCase()}`,
        entity: "User",
        entityId: id,
        newData: {
          type,
          action,
          amount,
          reason: reason ?? null,
        },
      },
    });

    // Notify the user (skip noise for level/xp progression)
    if (type === "points" || type === "cash") {
      await prisma.notification.create({
        data: {
          userId: id,
          type: "SYSTEM",
          title: action === "add" ? "Balance Added" : "Balance Deducted",
          message: `${amount} ${
            type === "points" ? "points" : "USD"
          } has been ${
            action === "add" ? "added to" : "deducted from"
          } your account. ${reason ? `Reason: ${reason}` : ""}`,
        },
      });
    }

    const newBalance =
      type === "points"
        ? updatedUser.pointsBalance
        : type === "cash"
        ? updatedUser.cashBalance
        : type === "level"
        ? updatedUser.level
        : updatedUser.xp;

    return NextResponse.json({
      message: `${type[0].toUpperCase()}${type.slice(1)} ${
        action === "add" ? "added" : "deducted"
      } successfully`,
      newBalance,
    });
  } catch (error) {
    console.error("Error adjusting balance:", error);
    return NextResponse.json(
      { error: "Failed to adjust balance" },
      { status: 500 }
    );
  }
}
