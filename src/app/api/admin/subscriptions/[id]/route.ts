import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { NotificationType } from "@/generated/prisma";
import { defaultPackage } from "@/lib/packages";
import { toNum } from "@/lib/money";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/admin/subscriptions/[id] - Get subscription details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "packages.view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { package: true },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: subscription.userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        package: { select: { id: true, slug: true, name: true } },
        packageExpiresAt: true,
      },
    });

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        user: {
          id: subscription.userId,
          name: user?.name || "Unknown",
          email: user?.email || "",
          avatar: user?.avatar,
          currentPackage: user?.package?.name ?? null,
          packageExpiresAt: user?.packageExpiresAt,
        },
        package: {
          id: subscription.package?.id,
          slug: subscription.package?.slug,
          name: subscription.package?.name || "—",
          price: toNum(subscription.amount),
        },
        amount: toNum(subscription.amount),
        paymentMethod: subscription.paymentMethod,
        transactionId: subscription.transactionId,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        isActive: subscription.isActive,
        autoRenew: subscription.autoRenew,
        createdAt: subscription.createdAt,
        status: subscription.isActive ? "ACTIVE" : "PENDING_VERIFICATION",
      },
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}

// POST /api/admin/subscriptions/[id] - Approve or reject subscription
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "packages.edit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, rejectionReason } = body;

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Use 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { package: true },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    if (subscription.isActive) {
      return NextResponse.json(
        { error: "Subscription is already active" },
        { status: 400 }
      );
    }

    const pkg = subscription.package;
    const planLabel = pkg?.name ?? "—";

    if (action === "approve") {
      const startDate = new Date();
      const endDate = new Date();

      const monthsDiff = Math.round(
        (subscription.endDate.getTime() - subscription.startDate.getTime()) /
          (1000 * 60 * 60 * 24 * 30)
      );

      if (monthsDiff >= 12) {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      await prisma.$transaction([
        prisma.subscription.update({
          where: { id },
          data: {
            isActive: true,
            startDate,
            endDate,
          },
        }),
        prisma.user.update({
          where: { id: subscription.userId },
          data: {
            packageId: subscription.packageId,
            packageExpiresAt: endDate,
          },
        }),
        prisma.notification.create({
          data: {
            userId: subscription.userId,
            type: NotificationType.SYSTEM,
            title: "Package Activated!",
            message: `Your ${planLabel} package has been activated. Enjoy your premium benefits until ${endDate.toLocaleDateString()}.`,
            data: {
              subscriptionId: subscription.id,
              packageId: subscription.packageId,
              expiresAt: endDate.toISOString(),
            },
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: "SUBSCRIPTION_APPROVED",
            entity: "Subscription",
            entityId: subscription.id,
            newData: {
              userId: subscription.userId,
              packageId: subscription.packageId,
              amount: subscription.amount,
              transactionId: subscription.transactionId,
            },
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        message: "Subscription approved successfully",
        subscription: {
          id: subscription.id,
          packageId: subscription.packageId,
          startDate,
          endDate,
          status: "ACTIVE",
        },
      });
    } else {
      if (!rejectionReason) {
        return NextResponse.json(
          { error: "Rejection reason is required" },
          { status: 400 }
        );
      }

      await prisma.$transaction([
        prisma.subscription.delete({
          where: { id },
        }),
        prisma.notification.create({
          data: {
            userId: subscription.userId,
            type: NotificationType.SYSTEM,
            title: "Subscription Request Rejected",
            message: `Your subscription request for ${planLabel} package has been rejected. Reason: ${rejectionReason}`,
            data: {
              subscriptionId: subscription.id,
              packageId: subscription.packageId,
              rejectionReason,
            },
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: "SUBSCRIPTION_REJECTED",
            entity: "Subscription",
            entityId: subscription.id,
            newData: {
              userId: subscription.userId,
              packageId: subscription.packageId,
              amount: subscription.amount,
              transactionId: subscription.transactionId,
              rejectionReason,
            },
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        message: "Subscription rejected successfully",
      });
    }
  } catch (error) {
    console.error("Error processing subscription:", error);
    return NextResponse.json(
      { error: "Failed to process subscription" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/subscriptions/[id] - Cancel active subscription
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "packages.edit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { reason } = body;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { package: true },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    const planLabel = subscription.package?.name ?? "—";
    // Revert user to the system default plan instead of a hardcoded FREE.
    const defaultPlan = await defaultPackage();

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id },
        data: { isActive: false },
      }),
      prisma.user.update({
        where: { id: subscription.userId },
        data: {
          packageId: defaultPlan?.id ?? null,
          packageExpiresAt: null,
        },
      }),
      prisma.notification.create({
        data: {
          userId: subscription.userId,
          type: NotificationType.SYSTEM,
          title: "Subscription Cancelled",
          message: `Your ${planLabel} subscription has been cancelled by admin.${reason ? ` Reason: ${reason}` : ""}`,
          data: {
            subscriptionId: subscription.id,
            packageId: subscription.packageId,
            reason,
          },
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "SUBSCRIPTION_CANCELLED",
          entity: "Subscription",
          entityId: subscription.id,
          newData: {
            userId: subscription.userId,
            packageId: subscription.packageId,
            reason,
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Subscription cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
