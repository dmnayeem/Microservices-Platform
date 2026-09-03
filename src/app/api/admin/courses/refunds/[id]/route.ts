import { usd } from "@/lib/utils";
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

/** Cents precision. `round2` in `@/lib/money` returns a Decimal; these figures
 *  stay plain numbers all the way to Prisma. */
const money2 = (n: number) => Math.round(n * 100) / 100;

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
        enrollment: { select: { id: true, pricePaid: true, platformFeeUsd: true } },
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
          targetUserId: request.userId,
          summary: `Rejected a course refund${v.data.adminNote ? ` — ${v.data.adminNote}` : ""}`,
          newData: { adminNote: v.data.adminNote ?? null },
        },
      });
      return NextResponse.json({ refundRequest: updated });
    }

    // ── Approve: refund the buyer + reverse tutor credit ──
    const c = request.course;
    const refundAmount = toNum(request.enrollment?.pricePaid);

    // Prefer the fee STORED on the enrolment. Recomputing from the current bps
    // reconstructs a split that may no longer match the one the sale was
    // actually booked at — an admin changing the commission rate between the
    // purchase and the refund would silently move money that never moved.
    // `platformFeeUsd` is nullable for rows written before the column existed,
    // so the recomputation stays as the fallback for those.
    const storedFee = request.enrollment?.platformFeeUsd;
    let platformFee: number;
    let tutorAmount: number;
    if (storedFee != null) {
      platformFee = toNum(storedFee);
      tutorAmount = Math.max(0, refundAmount - platformFee);
    } else {
      const bps = await resolveCourseCommissionBps({
        categorySlug: c.category_rel?.slug ?? null,
        perCourseOverride: c.commissionRateBps,
      });
      const split = splitCoursePrice(refundAmount, bps);
      platformFee = split.fee;
      tutorAmount = split.tutorAmount;
    }

    // The affiliate's commission is paid OUT of the tutor's cut at enrol time
    // (`api/courses/[id]/enroll/route.ts` — "Affiliate payout (from the tutor's
    // cut)"), so the tutor only ever banked `tutorAmount - affiliateAmount`.
    // This route used to claw back the full `tutorAmount` AND call
    // `reverseAffiliateCommission`, taking the affiliate's cut twice — once from
    // the tutor who never received it, once from the affiliate who did.
    const commission = request.enrollmentId
      ? await prisma.affiliateCommission.findUnique({
          where: {
            sourceType_orderRef: {
              sourceType: "COURSE",
              orderRef: request.enrollmentId,
            },
          },
          select: { commissionAmount: true },
        })
      : null;
    const affiliateAmount = toNum(commission?.commissionAmount);
    const tutorOwed = Math.max(0, money2(tutorAmount - affiliateAmount));
    // What was actually recovered from the tutor; the clamp below can lower it.
    let tutorClawback = 0;

    await prisma.$transaction(async (tx) => {
      // Claim the request. Without this a double-click ran the whole refund
      // twice — the second pass no longer trips the ledger constraint now that
      // the enrolment delete is survivable.
      const claimed = await tx.courseRefundRequest.updateMany({
        where: { id, status: CourseRefundStatus.PENDING },
        data: {
          status: CourseRefundStatus.APPROVED,
          refundedAmount: refundAmount,
          adminNote: v.data.adminNote ?? null,
          processedById: session.user.id,
          processedAt: new Date(),
        },
      });
      if (claimed.count === 0) throw new Error("REFUND_ALREADY_PROCESSED");

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
      if (c.tutorId && tutorOwed > 0) {
        // Clamp to the tutor's balance. This decremented unconditionally, so a
        // tutor who had already withdrawn their earnings was pushed to a
        // NEGATIVE balance — which every later credit silently paid off first.
        // The unrecoverable remainder is recorded instead of hidden.
        const tutorRow = await tx.user.findUnique({
          where: { id: c.tutorId },
          select: { cashBalance: true },
        });
        tutorClawback = Math.min(toNum(tutorRow?.cashBalance), tutorOwed);
        if (tutorClawback > 0) {
          await tx.user.update({
            where: { id: c.tutorId },
            data: {
              cashBalance: { decrement: tutorClawback },
              totalEarnings: { decrement: tutorClawback },
            },
          });
        }
        await tx.transaction.create({
          data: {
            userId: c.tutorId,
            type: TransactionType.COURSE_REFUND,
            status: TransactionStatus.COMPLETED,
            amount: -tutorClawback,
            points: 0,
            description: `Refund clawback — "${c.title}"`,
            reference: `course_refund_${c.id}_${request.id}`,
            metadata: {
              courseId: c.id,
              refundRequestId: request.id,
              refundToUserId: request.userId,
              owed: tutorOwed,
              clawedBack: tutorClawback,
              shortfall: money2(tutorOwed - tutorClawback),
              affiliateAmount,
            },
          },
        });
        await tx.tutorProfile.updateMany({
          where: { userId: c.tutorId },
          data: {
            totalStudents: { decrement: 1 },
            totalEarningsCents: { decrement: Math.round(tutorClawback * 100) },
          },
        });
      }

      // 2b. Give back the platform's commission on the refunded sale. It was
      // only ever implicit — the house funded 100% and recovered 80%, netting
      // to zero — but with nothing on the ledger saying so, course revenue
      // stayed overstated by the fee forever. Booked against the tutor's row so
      // it sits with the sale it reverses.
      if (c.tutorId && platformFee > 0) {
        await tx.transaction.create({
          data: {
            userId: c.tutorId,
            type: TransactionType.ADMIN_FEE,
            status: TransactionStatus.COMPLETED,
            amount: -platformFee,
            points: 0,
            description: `Course fee reversed by refund — "${c.title}"`,
            reference: `course_fee_reversal_${c.id}_${request.id}`,
            metadata: {
              courseId: c.id,
              refundRequestId: request.id,
              originalFee: platformFee,
              feeSource: storedFee != null ? "enrollment" : "recomputed",
            },
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
      // The request row was already claimed at the top of this transaction, so
      // it survives this delete via the SetNull FK — `enrollmentId` simply
      // becomes null and the refund record stays as the audit trail. Under the
      // old Cascade FK this delete destroyed the row the transaction went on to
      // update, which is why approval always ended in P2025 and a full rollback.
      if (request.enrollmentId) {
        await tx.courseEnrollment.delete({
          where: { id: request.enrollmentId },
        });
      }
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
        message: `${usd(refundAmount)} for "${c.title}" was returned to your wallet.`,
        data: { courseId: c.id, refundRequestId: request.id, refundedAmount: refundAmount },
      },
    });
    if (c.tutorId) {
      await prisma.notification.create({
        data: {
          userId: c.tutorId,
          type: NotificationType.COURSE,
          title: "Refund processed",
          message: `An admin approved a ${usd(refundAmount)} refund on "${c.title}". The commission has been clawed back.`,
          data: { courseId: c.id, refundRequestId: request.id, clawback: tutorClawback },
        },
      });
    }
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_REFUND_APPROVED",
        entity: "CourseRefundRequest",
        entityId: id,
        targetUserId: request.userId,
        summary: `Approved a course refund of ${usd(refundAmount)}`,
        newData: {
          refundAmount,
          tutorOwed,
          tutorClawback,
          platformFeeReversed: platformFee,
          affiliateAmount,
          adminNote: v.data.adminNote ?? null,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      refundAmount,
      tutorOwed,
      tutorClawback,
      platformFeeReversed: platformFee,
      affiliateReversed: affiliateAmount,
    });
  } catch (error) {
    // The status CAS lost — another admin (or a double-click) already processed
    // this request. The transaction rolled back, so nothing was refunded twice.
    if (error instanceof Error && error.message === "REFUND_ALREADY_PROCESSED") {
      return NextResponse.json(
        { error: "This refund request has already been processed." },
        { status: 409 }
      );
    }
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
