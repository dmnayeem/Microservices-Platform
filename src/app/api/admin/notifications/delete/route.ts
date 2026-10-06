import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

// POST /api/admin/notifications/delete - Delete notifications (admin)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "notifications.send"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { notificationIds } = body;

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json(
        { error: "notificationIds array is required" },
        { status: 400 }
      );
    }

    // Snapshot first — a deleted notification leaves nothing to look back at.
    const doomed = await prisma.notification.findMany({
      where: { id: { in: notificationIds } },
      select: { id: true, userId: true, type: true, title: true },
    });

    // Delete notifications
    const result = await prisma.notification.deleteMany({
      where: {
        id: { in: notificationIds },
      },
    });

    const owners = [...new Set(doomed.map((n) => n.userId))];
    await writeAudit({
      actorId: session.user.id,
      action: "NOTIFICATIONS_DELETED",
      entity: "Notification",
      targetUserId: owners.length === 1 ? owners[0] : null,
      summary: `Deleted ${result.count} notification(s)${owners.length > 1 ? ` across ${owners.length} users` : ""}`,
      meta: { before: doomed.slice(0, 200), after: null, count: result.count, userIds: owners.slice(0, 200) },
    });

    return NextResponse.json({
      message: `${result.count} notification(s) deleted`,
      count: result.count,
    });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    return NextResponse.json(
      { error: "Failed to delete notifications" },
      { status: 500 }
    );
  }
}
