import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[A-Z0-9_-]+$/, "Use uppercase letters / numbers / - / _"),
  type: z.enum(["PERCENT", "FIXED"]),
  value: z.number().min(0).max(10000),
  scope: z.enum(["ALL", "CATEGORY", "SPECIFIC_COURSES"]).default("ALL"),
  categoryIds: z.array(z.string()).max(50).default([]),
  courseIds: z.array(z.string()).max(200).default([]),
  minPurchase: z.number().min(0).optional().nullable(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).optional().nullable(),
  perUserLimit: z.number().int().min(0).max(100).default(1),
  validFrom: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

// GET /api/admin/coupons?status=
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // "active" | "inactive" | null
    const where: Record<string, unknown> = {};
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    const rows = await prisma.courseCoupon.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("List coupons failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// POST /api/admin/coupons — create
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
    const d = v.data;
    if (d.type === "PERCENT" && d.value > 100) {
      return NextResponse.json(
        { error: "Percent discount can't be more than 100" },
        { status: 400 }
      );
    }
    const coupon = await prisma.courseCoupon.create({
      data: {
        code: d.code.toUpperCase(),
        type: d.type,
        value: d.value,
        scope: d.scope,
        categoryIds: d.categoryIds,
        courseIds: d.courseIds,
        minPurchase: d.minPurchase ?? null,
        maxRedemptions: d.maxRedemptions ?? null,
        perUserLimit: d.perUserLimit,
        validFrom: d.validFrom ? new Date(d.validFrom) : new Date(),
        validUntil: d.validUntil ? new Date(d.validUntil) : null,
        isActive: d.isActive,
        createdById: session.user.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COUPON_CREATED",
        entity: "CourseCoupon",
        entityId: coupon.id,
        newData: JSON.parse(JSON.stringify({ code: coupon.code, type: coupon.type, value: coupon.value, scope: coupon.scope })),
      },
    });
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      /Unique constraint failed.*code/i.test(error.message)
    ) {
      return NextResponse.json(
        { error: "A coupon with this code already exists" },
        { status: 409 }
      );
    }
    console.error("Create coupon failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
