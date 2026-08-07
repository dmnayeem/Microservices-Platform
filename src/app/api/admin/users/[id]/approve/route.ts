import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// POST /api/admin/users/[id]/approve - Approve a pending user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "users.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

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
        { error: "Only a super admin can modify a super admin account" },
        { status: 403 }
      );
    }

    if (user.status === "ACTIVE") {
      return NextResponse.json(
        { error: "User is already active" },
        { status: 400 }
      );
    }

    if (user.status === "BANNED") {
      return NextResponse.json(
        { error: "Cannot approve banned user. Unban first." },
        { status: 400 }
      );
    }

    // Approve the user
    await prisma.user.update({
      where: { id },
      data: {
        status: "ACTIVE",
        emailVerified: user.emailVerified || new Date(),
      },
    });

    // Create notification for the user
    await prisma.notification.create({
      data: {
        userId: id,
        type: "SYSTEM",
        title: "Account Approved",
        message: "Your account has been approved! You can now access all features and start earning.",
      },
    });

    return NextResponse.json({
      message: "User approved successfully",
    });
  } catch (error) {
    console.error("Error approving user:", error);
    return NextResponse.json(
      { error: "Failed to approve user" },
      { status: 500 }
    );
  }
}
