import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { lt } from "@/lib/money";
import { getPointsPerUsd } from "@/lib/economy";
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

    // One permission per kind, so a super admin can allow XP fixes without
    // allowing cash. Points and cash are money (granted by name).
    const perm = ({
      points: "users.adjust_points",
      cash: "users.adjust_cash",
      xp: "users.adjust_xp",
      level: "users.adjust_level",
    } as const)[type];
    if (!perm || !(await can(session.user.id, perm))) {
      return NextResponse.json(
        { error: `You do not have permission to adjust ${type} — ask a super admin.` },
        { status: 403 }
      );
    }

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

    // Points ↔ USD rate: a points gift must also raise lifetime `totalEarnings`
    // (the profile "total points" is derived from it), matching the bulk-adjust
    // route and every normal earn path — otherwise gifted points never show in
    // the profile total.
    const pointsPerUsd = await getPointsPerUsd();

    // Update user balance/progression and create transaction — in ONE
    // transaction, and a deduct is a compare-and-set (`gte`): the sufficiency
    // check above reads a row fetched earlier, so two concurrent deducts (or a
    // deduct racing a withdrawal hold) could both pass it and drive the
    // balance negative; and the ledger row used to be a separate write that
    // could fail after the balance had already moved.
    const deductGuard =
      action !== "deduct"
        ? {}
        : type === "points"
        ? { pointsBalance: { gte: amount } }
        : type === "cash"
        ? { cashBalance: { gte: amount } }
        : type === "level"
        ? { level: { gte: amount + 1 } }
        : { xp: { gte: amount } };
    let updatedUser;
    try {
      updatedUser = await prisma.$transaction(async (tx) => {
        const moved = await tx.user.updateMany({
          where: { id, ...deductGuard },
          data: {
            pointsBalance:
              type === "points" ? { increment: adjustmentAmount } : undefined,
            cashBalance:
              type === "cash" ? { increment: adjustmentAmount } : undefined,
            level: type === "level" ? { increment: adjustmentAmount } : undefined,
            xp: type === "xp" ? { increment: adjustmentAmount } : undefined,
            // Only positive points credits raise lifetime earnings (a deduct never
            // lowers lifetime earned — mirrors the bulk route).
            totalEarnings:
              type === "points" && adjustmentAmount > 0
                ? { increment: adjustmentAmount / pointsPerUsd }
                : undefined,
          },
        });
        if (moved.count === 0) throw new Error("INSUFFICIENT");
    
        // Only points / cash create transactions; level + xp are progression-only
        if (type === "points" || type === "cash") {
          await tx.transaction.create({
            data: {
              userId: id,
              type: action === "add" ? "BONUS" : "PENALTY",
              points: type === "points" ? adjustmentAmount : 0,
              amount:
                type === "cash"
                  ? adjustmentAmount
                  : type === "points"
                  ? adjustmentAmount / pointsPerUsd
                  : 0,
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
        return tx.user.findUniqueOrThrow({ where: { id } });
      });
    } catch (e) {
      if (e instanceof Error && e.message === "INSUFFICIENT") {
        return NextResponse.json(
          { error: "The balance changed and is now too low for this deduction. Reload and try again." },
          { status: 409 }
        );
      }
      throw e;
    }

    // Audit log every adjustment
    await writeAudit({
      actorId: session.user.id,
      action: `BALANCE_${action.toUpperCase()}_${type.toUpperCase()}`,
      entity: "User",
      entityId: id,
      targetUserId: id,
      summary: `${action === "add" ? "Gave" : "Deducted"} ${amount} ${type}${reason ? ` — ${reason}` : ""}`,
      meta: { type, action, amount, reason: reason ?? null },
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
