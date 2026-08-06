import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(400).optional().nullable(),
  iconKey: z.string().max(40).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  order: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/admin/courses/categories/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.manage"))) {
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
    const category = await prisma.courseCategory.update({
      where: { id },
      data: v.data,
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_CATEGORY_UPDATE",
        entity: "CourseCategory",
        entityId: id,
        newData: JSON.parse(JSON.stringify(v.data)),
      },
    });
    return NextResponse.json({ category });
  } catch (error) {
    if (
      error instanceof Error &&
      /Unique constraint failed.*slug/i.test(error.message)
    ) {
      return NextResponse.json(
        { error: "Slug already in use" },
        { status: 409 }
      );
    }
    console.error("Update course category failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/courses/categories/:id — blocked if any courses still point at it
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const courseCount = await prisma.course.count({
      where: { categoryId: id },
    });
    if (courseCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete — ${courseCount} course(s) still use this category. Move or archive them first.`,
        },
        { status: 400 }
      );
    }
    await prisma.courseCategory.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_CATEGORY_DELETE",
        entity: "CourseCategory",
        entityId: id,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete course category failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
