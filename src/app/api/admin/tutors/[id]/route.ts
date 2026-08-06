import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  isSuspended: z.boolean().optional(),
  headline: z.string().max(120).optional().nullable(),
  bio: z.string().max(4000).optional(),
  expertise: z.array(z.string().min(1).max(60)).max(15).optional(),
});

// GET /api/admin/tutors/:id — tutor detail (id = TutorProfile.id)
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
    const tutor = await prisma.tutorProfile.findUnique({
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
            cashBalance: true,
          },
        },
      },
    });
    if (!tutor) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ tutor });
  } catch (error) {
    console.error("Get tutor failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/tutors/:id — suspend/unsuspend, edit profile fields
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
    const v = patchSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }

    const updated = await prisma.tutorProfile.update({
      where: { id },
      data: v.data,
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "TUTOR_PROFILE_UPDATE",
        entity: "TutorProfile",
        entityId: id,
        newData: JSON.parse(JSON.stringify(v.data)),
      },
    });

    return NextResponse.json({ tutor: updated });
  } catch (error) {
    console.error("Patch tutor failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
