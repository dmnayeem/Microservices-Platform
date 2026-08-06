import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
  getCourseCommissionConfig,
  saveCourseCommissionConfig,
} from "@/lib/course-commission";

// GET /api/admin/courses/commission
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const config = await getCourseCommissionConfig();
    return NextResponse.json({ config });
  } catch (error) {
    console.error("Get commission failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

const patchSchema = z.object({
  default: z.number().int().min(0).max(10000),
  byCategory: z.record(z.string(), z.number().int().min(0).max(10000)).optional(),
});

// PATCH /api/admin/courses/commission
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const v = patchSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    await saveCourseCommissionConfig({
      default: v.data.default,
      byCategory: v.data.byCategory ?? {},
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_COMMISSION_UPDATED",
        entity: "SystemSetting",
        entityId: "course_commission_rates",
        newData: JSON.parse(JSON.stringify(v.data)),
      },
    });
    const config = await getCourseCommissionConfig();
    return NextResponse.json({ config });
  } catch (error) {
    console.error("Update commission failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
