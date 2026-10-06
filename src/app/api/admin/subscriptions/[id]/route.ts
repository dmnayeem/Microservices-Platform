import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@/generated/prisma";
import { defaultPackage } from "@/lib/packages";
import { toNum } from "@/lib/money";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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

    if (!(await can(session.user.id, "packages.view"))) {
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
        proofUrl: subscription.proofUrl,
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

    if (!(await can(session.user.id, "packages.edit"))) {
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

    // `isActive: false` also means expired or cancelled, not only "awaiting
    // verification". The request's own ledger row tells them apart: an
    // off-platform request writes it PENDING, and only a PENDING one may be
    // approved or rejected here. A row with NO ledger row at all (the retired
    // POST /api/packages path, or an expired plan) is refused too — approving
    // one would bring an expired plan back to life for nothing.
    const ledgerRef = `subscription_${subscription.id}`;
    const ledger = await prisma.transaction.findUnique({
      where: { userId_reference: { userId: subscription.userId, reference: ledgerRef } },
      select: { status: true },
    });
    if (!ledger || ledger.status !== "PENDING") {
      return NextResponse.json(
        { error: "This subscription is not awaiting verification (it has expired, was cancelled, or was already processed)." },
        { status: 400 }
      );
    }
    // Compare-and-set on the PENDING ledger row: of two admins approving (or
    // an admin approving while the user cancels) only one settles it; the
    // other sees count 0 and the whole transaction changes nothing.
    const settleLedger = async (tx: Tx, status: "COMPLETED" | "CANCELLED") => {
      const r = await tx.transaction.updateMany({
        where: { userId: subscription.userId, reference: ledgerRef, status: "PENDING" },
        data: { status },
      });
      if (r.count === 0) throw new Error("ALREADY_PROCESSED");
    };
    const alreadyProcessed = () =>
      NextResponse.json({ error: "This request was already processed." }, { status: 409 });

    if (action === "approve") {
      // Keep the length the user paid for. This used to round every request to
      // one month or one year, so a paid QUARTERLY plan got a month and a
      // LIFETIME plan a year. The window starts now, not when it was requested
      // — or, when the user is still on this same plan, where it now ends.
      const now = new Date();
      const termMs = subscription.endDate.getTime() - subscription.startDate.getTime();
      let startDate = now;
      let endDate = now;

      try {
        await prisma.$transaction(async (tx) => {
          await settleLedger(tx, "COMPLETED");
          const u = await tx.user.findUnique({
            where: { id: subscription.userId },
            select: { packageId: true, packageExpiresAt: true },
          });
          const currentEnd = u?.packageExpiresAt ?? null;
          const extendSame =
            u?.packageId === subscription.packageId &&
            currentEnd != null &&
            currentEnd.getTime() > now.getTime();
          startDate = extendSame && currentEnd ? currentEnd : now;
          endDate = new Date(startDate.getTime() + termMs);
          // The approved plan replaces whatever was active: end those terms
          // now and stop their auto-renew.
          await tx.subscription.updateMany({
            where: { userId: subscription.userId, isActive: true, id: { not: id }, endDate: { gt: now } },
            data: { endDate: now },
          });
          await tx.subscription.updateMany({
            where: { userId: subscription.userId, isActive: true, id: { not: id } },
            data: { isActive: false, autoRenew: false },
          });
          await tx.subscription.update({
            where: { id },
            data: { isActive: true, startDate, endDate },
          });
          await tx.user.update({
            where: { id: subscription.userId },
            data: { packageId: subscription.packageId, packageExpiresAt: endDate },
          });
          await tx.notification.create({
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
          });
          await tx.auditLog.create({
            data: {
              userId: session.user.id,
              action: "SUBSCRIPTION_APPROVED",
              entity: "Subscription",
              entityId: subscription.id,
              targetUserId: subscription.userId,
              summary: `Approved a ${planLabel} subscription`,
              newData: {
                userId: subscription.userId,
                packageId: subscription.packageId,
                amount: subscription.amount,
                transactionId: subscription.transactionId,
                proofUrl: subscription.proofUrl,
              },
            },
          });
        });
      } catch (err) {
        if (err instanceof Error && err.message === "ALREADY_PROCESSED") return alreadyProcessed();
        throw err;
      }

      // The referrer's subscription bonus — it used to be paid only for wallet
      // purchases, so an invitee paying by bKash/crypto never earned it. Once
      // per invitee, never for $0; best-effort.
      if (toNum(subscription.amount) > 0) {
        try {
          const { awardReferralSubscriptionBonus } = await import("@/lib/referral-bonus");
          await awardReferralSubscriptionBonus(subscription.userId, subscription.id);
        } catch {
          /* never fail an approval on the bonus */
        }
      }

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

      try {
        await prisma.$transaction(async (tx) => {
          await settleLedger(tx, "CANCELLED");
          await tx.subscription.delete({ where: { id } });
          await tx.notification.create({
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
          });
          await tx.auditLog.create({
            data: {
              userId: session.user.id,
              action: "SUBSCRIPTION_REJECTED",
              entity: "Subscription",
              entityId: subscription.id,
              targetUserId: subscription.userId,
              summary: `Rejected a ${planLabel} subscription${rejectionReason ? ` — ${rejectionReason}` : ""}`,
              newData: {
                userId: subscription.userId,
                packageId: subscription.packageId,
                amount: subscription.amount,
                transactionId: subscription.transactionId,
                proofUrl: subscription.proofUrl,
                rejectionReason,
              },
            },
          });
        });
      } catch (err) {
        if (err instanceof Error && err.message === "ALREADY_PROCESSED") return alreadyProcessed();
        throw err;
      }

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

    if (!(await can(session.user.id, "packages.edit"))) {
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
          targetUserId: subscription.userId,
          summary: `Cancelled a ${planLabel} subscription${reason ? ` — ${reason}` : ""}`,
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
