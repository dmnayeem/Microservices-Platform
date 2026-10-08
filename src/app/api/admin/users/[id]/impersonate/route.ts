import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import crypto from "crypto";
import { impersonationActor, impersonationRefusal } from "@/lib/impersonation";

// POST /api/admin/users/[id]/impersonate — "Login as user". Who may, and as
// whom, is decided in src/lib/impersonation.ts (super admin, or an admin the
// super admin allowed in Control Center).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await impersonationActor(session.user.id);
    if (!actor) {
      return NextResponse.json(
        { error: "You don't have access to Login as user. The super admin can allow it in Control Center." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, impersonationBlocked: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const refusal = impersonationRefusal(actor, targetUser);
    if (refusal) {
      return NextResponse.json({ error: refusal }, { status: 403 });
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
      meta: { targetEmail: targetUser.email, actorRole: actor.role },
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
