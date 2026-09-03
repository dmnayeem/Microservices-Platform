import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";
import {
  approveTutorApplication,
  rejectTutorApplication,
} from "@/lib/tutor-application";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    adminNote: z.string().max(2000).optional().nullable(),
  }),
  z.object({
    action: z.literal("reject"),
    adminNote: z.string().max(2000).optional().nullable(),
  }),
]);

// GET /api/admin/tutors/applications/:id — full detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "tutor.applications.review"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const app = await prisma.tutorApplication.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
            createdAt: true,
            country: true,
            phone: true,
          },
        },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!app) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ application: app });
  } catch (error) {
    console.error("Get tutor application failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/tutors/applications/:id — approve / reject
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "tutor.applications.review"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const v = actionSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const action = v.data;

    let updated;
    if (action.action === "approve") {
      updated = await approveTutorApplication({
        applicationId: id,
        reviewerId: session.user.id,
        adminNote: action.adminNote ?? null,
      });
    } else {
      updated = await rejectTutorApplication({
        applicationId: id,
        reviewerId: session.user.id,
        adminNote: action.adminNote ?? null,
      });
    }

    await writeAudit({
      actorId: session.user.id,
      action: `TUTOR_APPLICATION_${action.action.toUpperCase()}`,
      entity: "TutorApplication",
      entityId: id,
      targetUserId: (updated as { userId?: string } | null)?.userId ?? null,
      summary: `${action.action === "approve" ? "Approved" : "Rejected"} tutor application${action.adminNote ? ` — ${action.adminNote}` : ""}`,
      meta: { adminNote: action.adminNote ?? null },
    });

    return NextResponse.json({ application: updated });
  } catch (error) {
    console.error("Patch tutor application failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
