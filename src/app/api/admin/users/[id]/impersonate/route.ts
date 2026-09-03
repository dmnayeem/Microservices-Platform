import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import crypto from "crypto";

// POST /api/admin/users/[id]/impersonate - Impersonate a user (super admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admin can impersonate
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super admin can impersonate users" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Cannot impersonate another super admin
    if (targetUser.role === "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Cannot impersonate another super admin" },
        { status: 403 }
      );
    }

    // Cannot impersonate yourself
    if (targetUser.id === session.user.id) {
      return NextResponse.json(
        { error: "Cannot impersonate yourself" },
        { status: 400 }
      );
    }

    // Generate a one-time impersonation token
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store the impersonation token
    await prisma.verificationToken.create({
      data: {
        identifier: `impersonate:${targetUser.id}`,
        token,
        expires,
        type: "IMPERSONATE",
      },
    });

    // Audit trail — impersonation must be attributable to the admin. It was
    // recorded without `targetUserId`, so signing in as somebody never showed
    // up on that person's own activity, which is the one place it matters.
    await writeAudit({
      actorId: session.user.id,
      action: "IMPERSONATE_START",
      entity: "User",
      entityId: targetUser.id,
      targetUserId: targetUser.id,
      summary: "Signed in as this user (impersonation)",
      meta: { targetEmail: targetUser.email },
    });

    return NextResponse.json({
      message: "Impersonation token generated",
      token,
      userId: targetUser.id,
      userEmail: targetUser.email,
    });
  } catch (error) {
    console.error("Error impersonating user:", error);
    return NextResponse.json(
      { error: "Failed to impersonate user" },
      { status: 500 }
    );
  }
}
