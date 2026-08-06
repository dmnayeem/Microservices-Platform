import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  value: z.number().min(0).max(10000).optional(),
  scope: z.enum(["ALL", "CATEGORY", "SPECIFIC_COURSES"]).optional(),
  categoryIds: z.array(z.string()).max(50).optional(),
  courseIds: z.array(z.string()).max(200).optional(),
  minPurchase: z.number().min(0).optional().nullable(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).optional().nullable(),
  perUserLimit: z.number().int().min(0).max(100).optional(),
  validFrom: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
});

// PATCH /api/admin/coupons/:id
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
    const d = v.data;
    const data: Record<string, unknown> = {};
    if (d.isActive !== undefined) data.isActive = d.isActive;
    if (d.value !== undefined) data.value = d.value;
    if (d.scope !== undefined) data.scope = d.scope;
    if (d.categoryIds !== undefined) data.categoryIds = d.categoryIds;
    if (d.courseIds !== undefined) data.courseIds = d.courseIds;
    if (d.minPurchase !== undefined) data.minPurchase = d.minPurchase;
    if (d.maxRedemptions !== undefined) data.maxRedemptions = d.maxRedemptions;
    if (d.perUserLimit !== undefined) data.perUserLimit = d.perUserLimit;
    if (d.validFrom !== undefined)
      data.validFrom = d.validFrom ? new Date(d.validFrom) : new Date();
    if (d.validUntil !== undefined)
      data.validUntil = d.validUntil ? new Date(d.validUntil) : null;

    const coupon = await prisma.courseCoupon.update({
      where: { id },
      data: data as never,
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COUPON_UPDATED",
        entity: "CourseCoupon",
        entityId: id,
        newData: JSON.parse(JSON.stringify(data)),
      },
    });
    return NextResponse.json({ coupon });
  } catch (error) {
    console.error("Update coupon failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/coupons/:id
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
    await prisma.courseCoupon.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COUPON_DELETED",
        entity: "CourseCoupon",
        entityId: id,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete coupon failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
