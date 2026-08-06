import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters / numbers / dashes only"),
  name: z.string().min(2).max(80),
  description: z.string().max(400).optional().nullable(),
  iconKey: z.string().max(40).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  order: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/admin/courses/categories — list, includes subcategories + course counts
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const rows = await prisma.courseCategory.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        subcategories: {
          orderBy: [{ order: "asc" }, { name: "asc" }],
        },
        _count: { select: { courses: true } },
      },
    });
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("List course categories failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// POST /api/admin/courses/categories — create
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const v = createSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const category = await prisma.courseCategory.create({ data: v.data });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_CATEGORY_CREATE",
        entity: "CourseCategory",
        entityId: category.id,
        newData: JSON.parse(JSON.stringify(v.data)),
      },
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    // Handle the unique-constraint case nicely
    if (
      error instanceof Error &&
      /Unique constraint failed.*slug/i.test(error.message)
    ) {
      return NextResponse.json(
        { error: "Slug already in use" },
        { status: 409 }
      );
    }
    console.error("Create course category failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
