import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { toNum } from "@/lib/money";

// GET /api/admin/subscriptions - Get all subscription requests
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "packages.view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // pending, active, all
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (status === "pending") {
      where.isActive = false;
    } else if (status === "active") {
      where.isActive = true;
    }

    // Get subscriptions (with package join)
    const subscriptions = await prisma.subscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { package: { select: { id: true, slug: true, name: true } } },
    });

    const total = await prisma.subscription.count({ where });

    const userIds = [...new Set(subscriptions.map((s) => s.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        package: { select: { slug: true, name: true } },
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      subscriptions: subscriptions.map((sub) => {
        const user = userMap.get(sub.userId) as
          | { name: string | null; email: string; avatar: string | null; package: { slug: string; name: string } | null }
          | undefined;
        const subPkg = (sub as unknown as { package: { id: string; slug: string; name: string } | null }).package;
        return {
          id: sub.id,
          user: {
            id: sub.userId,
            name: user?.name || "Unknown",
            email: user?.email || "",
            avatar: user?.avatar,
            currentPackage: user?.package?.name ?? null,
          },
          package: {
            id: subPkg?.id,
            slug: subPkg?.slug,
            name: subPkg?.name ?? "—",
          },
          amount: toNum(sub.amount),
          paymentMethod: sub.paymentMethod,
          transactionId: sub.transactionId,
          startDate: sub.startDate,
          endDate: sub.endDate,
          isActive: sub.isActive,
          autoRenew: sub.autoRenew,
          createdAt: sub.createdAt,
          status: sub.isActive ? "ACTIVE" : "PENDING_VERIFICATION",
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        pending: await prisma.subscription.count({ where: { isActive: false } }),
        active: await prisma.subscription.count({ where: { isActive: true } }),
      },
    });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}
