import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { type UserRole } from "@/lib/rbac";
import { z } from "zod";

const banSchema = z.object({
  reason: z.string().max(500).optional(),
});

// POST /api/admin/users/[id]/ban - Ban a user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!(await can(session.user.id, "users.ban"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const validation = banSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { reason } = validation.data;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent banning admins unless you're super admin
    if (user.role !== "USER" && adminRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super admin can ban admin accounts" },
        { status: 403 }
      );
    }

    // Prevent banning super admins
    if (user.role === "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Cannot ban super admin accounts" },
        { status: 400 }
      );
    }

    if (user.status === "BANNED") {
      return NextResponse.json(
        { error: "User is already banned" },
        { status: 400 }
      );
    }

    // Ban the user
    await prisma.user.update({
      where: { id },
      data: {
        status: "BANNED",
      },
    });

    // Create notification for the user
    await prisma.notification.create({
      data: {
        userId: id,
        type: "SYSTEM",
        title: "Account Suspended",
        message: reason || "Your account has been suspended. Contact support for more information.",
      },
    });

    await writeAudit({
      actorId: session.user.id,
      action: "USER_BANNED",
      entity: "User",
      entityId: id,
      targetUserId: id,
      summary: `Banned user${reason ? ` — ${reason}` : ""}`,
      meta: { reason: reason ?? null },
    });

    return NextResponse.json({
      message: "User banned successfully",
    });
  } catch (error) {
    console.error("Error banning user:", error);
    return NextResponse.json(
      { error: "Failed to ban user" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/[id]/ban - Unban a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "users.ban"))) {
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

    if (user.status !== "BANNED") {
      return NextResponse.json(
        { error: "User is not banned" },
        { status: 400 }
      );
    }

    // Unban the user
    await prisma.user.update({
      where: { id },
      data: {
        status: "ACTIVE",
      },
    });

    // Create notification for the user
    await prisma.notification.create({
      data: {
        userId: id,
        type: "SYSTEM",
        title: "Account Restored",
        message: "Your account has been restored. You can now access all features.",
      },
    });

    await writeAudit({
      actorId: session.user.id,
      action: "USER_UNBANNED",
      entity: "User",
      entityId: id,
      targetUserId: id,
      summary: "Unbanned user (account restored)",
    });

    return NextResponse.json({
      message: "User unbanned successfully",
    });
  } catch (error) {
    console.error("Error unbanning user:", error);
    return NextResponse.json(
      { error: "Failed to unban user" },
      { status: 500 }
    );
  }
}
