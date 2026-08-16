import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { toNum } from "@/lib/money";
import { z } from "zod";
import {
  CourseRefundStatus,
  NotificationType,
  TransactionType,
  TransactionStatus,
} from "@/generated/prisma";
import {
  resolveCourseCommissionBps,
  splitCoursePrice,
} from "@/lib/course-commission";

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

// PATCH /api/admin/courses/refunds/:id
// Approve = refund buyer + claw back from tutor balance + close enrolment.
// Reject = just mark rejected.
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
    const v = actionSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }

    const request = await prisma.courseRefundRequest.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            tutorId: true,
            commissionRateBps: true,
            category_rel: { select: { slug: true } },
          },
        },
        enrollment: { select: { id: true, pricePaid: true } },
      },
    });
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (request.status !== CourseRefundStatus.PENDING) {
      return NextResponse.json(
        { error: `Already ${request.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    if (v.data.action === "reject") {
      const updated = await prisma.courseRefundRequest.update({
        where: { id },
        data: {
          status: CourseRefundStatus.REJECTED,
          adminNote: v.data.adminNote ?? null,
          processedById: session.user.id,
          processedAt: new Date(),
        },
      });
      await prisma.notification.create({
        data: {
          userId: request.userId,
          type: NotificationType.COURSE,
          title: "Refund rejected",
          message: v.data.adminNote
            ? `Refund for "${request.course.title}" was not approved. Note: ${v.data.adminNote}`
            : `Refund for "${request.course.title}" was not approved.`,
          data: { courseId: request.courseId, refundRequestId: request.id },
        },
      });
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "COURSE_REFUND_REJECTED",
          entity: "CourseRefundRequest",
          entityId: id,
          newData: { adminNote: v.data.adminNote ?? null },
        },
      });
      return NextResponse.json({ refundRequest: updated });
    }

    // ── Approve: refund the buyer + reverse tutor credit ──
    const c = request.course;
    const refundAmount = toNum(request.enrollment?.pricePaid);
    const bps = await resolveCourseCommissionBps({
      categorySlug: c.category_rel?.slug ?? null,
      perCourseOverride: c.commissionRateBps,
    });
    const { tutorAmount } = splitCoursePrice(refundAmount, bps);

    await prisma.$transaction(async (tx) => {
      // 1. Restore buyer wallet
      if (refundAmount > 0) {
        await tx.user.update({
          where: { id: request.userId },
          data: { cashBalance: { increment: refundAmount } },
        });
        await tx.transaction.create({
          data: {
            userId: request.userId,
            type: TransactionType.COURSE_REFUND,
            status: TransactionStatus.COMPLETED,
            amount: refundAmount,
            points: 0,
            description: `Refund — "${c.title}"`,
            reference: `course_refund_${c.id}_${request.id}`,
            metadata: {
              courseId: c.id,
              refundRequestId: request.id,
              originalEnrollmentId: request.enrollmentId,
            },
          },
        });
      }
      // 2. Claw back tutor credit (debit balance + counter)
      if (c.tutorId && tutorAmount > 0) {
        await tx.user.update({
          where: { id: c.tutorId },
          data: {
            cashBalance: { decrement: tutorAmount },
            totalEarnings: { decrement: tutorAmount },
          },
        });
        await tx.transaction.create({
          data: {
            userId: c.tutorId,
            type: TransactionType.COURSE_REFUND,
            status: TransactionStatus.COMPLETED,
            amount: -tutorAmount,
            points: 0,
            description: `Refund clawback — "${c.title}"`,
            reference: `course_refund_${c.id}_${request.id}`,
            metadata: {
              courseId: c.id,
              refundRequestId: request.id,
              refundToUserId: request.userId,
            },
          },
        });
        await tx.tutorProfile.updateMany({
          where: { userId: c.tutorId },
          data: {
            totalStudents: { decrement: 1 },
            totalEarningsCents: { decrement: Math.round(tutorAmount * 100) },
          },
        });
      }
      // 3. Reverse course counters + delete enrolment (so the user could re-enrol later)
      await tx.course.update({
        where: { id: c.id },
        data: {
          enrollmentCount: { decrement: 1 },
          totalRevenueCents: { decrement: Math.round(refundAmount * 100) },
        },
      });
      if (request.enrollmentId) {
        await tx.courseEnrollment.delete({
          where: { id: request.enrollmentId },
        });
      }
      // 4. Mark request approved
      await tx.courseRefundRequest.update({
        where: { id },
        data: {
          status: CourseRefundStatus.APPROVED,
          refundedAmount: refundAmount,
          adminNote: v.data.adminNote ?? null,
          processedById: session.user.id,
          processedAt: new Date(),
        },
      });
    });

    // Reverse any affiliate commission earned on this enrolment (best-effort).
    if (request.enrollmentId) {
      const { reverseAffiliateCommission } = await import("@/lib/affiliate");
      await reverseAffiliateCommission("COURSE", request.enrollmentId);
    }

    await prisma.notification.create({
      data: {
        userId: request.userId,
        type: NotificationType.COURSE,
        title: "Refund approved 💸",
        message: `$${refundAmount.toFixed(2)} for "${c.title}" was returned to your wallet.`,
        data: { courseId: c.id, refundRequestId: request.id, refundedAmount: refundAmount },
      },
    });
    if (c.tutorId) {
      await prisma.notification.create({
        data: {
          userId: c.tutorId,
          type: NotificationType.COURSE,
          title: "Refund processed",
          message: `An admin approved a $${refundAmount.toFixed(2)} refund on "${c.title}". The commission has been clawed back.`,
          data: { courseId: c.id, refundRequestId: request.id, clawback: tutorAmount },
        },
      });
    }
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_REFUND_APPROVED",
        entity: "CourseRefundRequest",
        entityId: id,
        newData: {
          refundAmount,
          tutorClawback: tutorAmount,
          adminNote: v.data.adminNote ?? null,
        },
      },
    });

    return NextResponse.json({ ok: true, refundAmount, tutorClawback: tutorAmount });
  } catch (error) {
    // Retry reuses reference `course_refund_<courseId>_<requestId>` → P2002; the
    // refund already settled, so report success not a 500.
    if (isDuplicateLedgerError(error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("Process refund failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
