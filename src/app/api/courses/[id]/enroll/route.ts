import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDuplicateLedgerError, withIdempotency } from "@/lib/idempotency";
import { z } from "zod";
import {
  NotificationType,
  TransactionType,
  TransactionStatus,
} from "@/generated/prisma";
import { validateCoupon } from "@/lib/course-coupon";
import {
  resolveCourseCommissionBps,
  splitCoursePrice,
} from "@/lib/course-commission";
import {
  AFFILIATE_COOKIE,
  getAffiliateConfig,
  isAffiliateEligible,
  computeAffiliateCommission,
  parseAttribution,
} from "@/lib/affiliate";
import { userCanFeature } from "@/lib/packages";
import { lt, sub, toNum, toNumOrNull } from "@/lib/money";

const enrollSchema = z.object({
  couponCode: z.string().max(60).optional().nullable(),
  // Phase 4 ships wallet only. Future-proofed for SSLCommerz / Stripe / bKash /
  // Nagad / PayPal — leave them as TODO hooks so we don't need a schema change.
  paymentMethod: z
    .enum(["wallet", "stripe", "sslcommerz", "bkash", "nagad", "paypal"])
    .default("wallet"),
});

// POST /api/courses/:id/enroll
//
// Wallet flow (Phase 4):
//  1. Validate coupon (optional).
//  2. Compute final price via splitCoursePrice( resolveCourseCommissionBps(...) ).
//  3. $transaction:
//      - Create CourseEnrollment
//      - Debit buyer.cashBalance
//      - Credit tutor.cashBalance + totalEarnings + totalRevenueCents
//      - Create COURSE_PURCHASE Transaction (buyer)
//      - Create COURSE_TUTOR_EARNING Transaction (tutor)
//      - Increment Course.enrollmentCount + totalRevenueCents
//      - Increment Coupon.redemptionsCount (if used)
//  4. Notifications to both parties.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withIdempotency(req, session.user.id, async () => {
  try {
    if (!(await userCanFeature(session.user.id, "courses"))) {
      return NextResponse.json({ error: "Courses are disabled for your plan" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const v = enrollSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const { couponCode, paymentMethod } = v.data;

    const course = await prisma.course.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: {
        id: true,
        title: true,
        status: true,
        isFree: true,
        price: true,
        discountPrice: true,
        commissionRateBps: true,
        affiliateCommissionType: true,
        affiliateCommissionValue: true,
        tutorId: true,
        category_rel: { select: { slug: true } },
      },
    });
    if (!course) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (course.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: "This course isn't open for enrolment." },
        { status: 400 }
      );
    }

    // A tutor can't enrol in their own course. Besides being nonsensical, the
    // buyer-debit and tutor-credit ledger rows share one reference
    // (`course_<courseId>_<enrollmentId>`) distinguished only by userId — if the
    // buyer *were* the tutor, both rows would collide on (userId, reference)
    // under the idempotency unique constraint.
    if (session.user.id === course.tutorId) {
      return NextResponse.json(
        { error: "You can't enrol in your own course." },
        { status: 400 }
      );
    }

    const existing = await prisma.courseEnrollment.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: session.user.id } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ enrollment: existing, alreadyEnrolled: true });
    }

    const livePrice = toNum(course.discountPrice ?? course.price);

    // ── Free path ─────────────────────────────────────────────────────────
    if (course.isFree || livePrice === 0) {
      const enrollment = await prisma.$transaction(async (tx) => {
        const e = await tx.courseEnrollment.create({
          data: {
            courseId: course.id,
            userId: session.user.id,
            pricePaid: 0,
          },
        });
        await tx.course.update({
          where: { id: course.id },
          data: { enrollmentCount: { increment: 1 } },
        });
        if (course.tutorId) {
          await tx.tutorProfile.updateMany({
            where: { userId: course.tutorId },
            data: { totalStudents: { increment: 1 } },
          });
        }
        return e;
      });
      await fireEnrolNotifications({
        courseId: course.id,
        courseTitle: course.title,
        tutorId: course.tutorId,
        buyerId: session.user.id,
        enrollmentId: enrollment.id,
        amount: 0,
      });
      return NextResponse.json({ enrollment });
    }

    // ── Paid path ─────────────────────────────────────────────────────────
    if (paymentMethod !== "wallet") {
      // TODO: integrate Stripe / SSLCommerz / bKash / Nagad / PayPal SDKs.
      return NextResponse.json(
        {
          error:
            "Only wallet checkout is enabled right now — top up your wallet, then enrol.",
        },
        { status: 400 }
      );
    }

    // Validate coupon (if any)
    let couponInfo: {
      id: string;
      code: string;
      discount: number;
      finalPrice: number;
    } | null = null;
    let finalPrice = livePrice;
    if (couponCode) {
      const r = await validateCoupon({
        code: couponCode,
        courseId: course.id,
        userId: session.user.id,
      });
      if (!r.valid) {
        return NextResponse.json({ error: r.reason }, { status: 400 });
      }
      couponInfo = {
        id: r.coupon.id,
        code: r.coupon.code,
        discount: r.discount,
        finalPrice: r.finalPrice,
      };
      finalPrice = r.finalPrice;
    }

    // Wallet balance check
    const buyer = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { cashBalance: true },
    });
    if (!buyer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (lt(buyer.cashBalance, finalPrice)) {
      return NextResponse.json(
        {
          error: `Wallet balance is $${toNum(buyer.cashBalance).toFixed(2)} — need $${finalPrice.toFixed(2)} to enrol.`,
          shortBy: sub(finalPrice, buyer.cashBalance).toNumber(),
        },
        { status: 402 }
      );
    }

    // Compute platform fee / tutor split
    const bps = await resolveCourseCommissionBps({
      categorySlug: course.category_rel?.slug ?? null,
      perCourseOverride: course.commissionRateBps,
    });
    const { fee, tutorAmount } = splitCoursePrice(finalPrice, bps);

    // Affiliate attribution (from the tutor's cut; platform fee unchanged).
    let affiliateId: string | null = null;
    let affiliateAmount = 0;
    if (
      course.tutorId &&
      isAffiliateEligible(course.affiliateCommissionType, toNumOrNull(course.affiliateCommissionValue))
    ) {
      const cfg = await getAffiliateConfig();
      if (cfg.enabled) {
        const attr = parseAttribution(
          req.cookies.get(AFFILIATE_COOKIE)?.value,
          "COURSE",
          course.id,
          cfg.cookieWindowDays,
          Date.now()
        );
        if (attr && attr.aff !== session.user.id && attr.aff !== course.tutorId) {
          const aff = await prisma.user.findUnique({
            where: { id: attr.aff },
            select: { id: true, affiliateJoinedAt: true },
          });
          if (aff?.affiliateJoinedAt) {
            affiliateAmount = computeAffiliateCommission(
              course.affiliateCommissionType,
              toNumOrNull(course.affiliateCommissionValue),
              finalPrice,
              tutorAmount
            );
            if (affiliateAmount > 0) affiliateId = aff.id;
          }
        }
      }
    }
    const tutorNet = affiliateId
      ? Math.round((tutorAmount - affiliateAmount) * 100) / 100
      : tutorAmount;

    // Atomic settle
    const result = await prisma.$transaction(async (tx) => {
      const enrollment = await tx.courseEnrollment.create({
        data: {
          courseId: course.id,
          userId: session.user.id,
          pricePaid: finalPrice,
          couponCode: couponInfo?.code ?? null,
        },
      });

      // Debit buyer
      await tx.user.update({
        where: { id: session.user.id },
        data: { cashBalance: { decrement: finalPrice } },
      });
      await tx.transaction.create({
        data: {
          userId: session.user.id,
          type: TransactionType.COURSE_PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -finalPrice,
          points: 0,
          description: `Course enrolment — "${course.title}"`,
          reference: `course_${course.id}_${enrollment.id}`,
          metadata: {
            courseId: course.id,
            enrollmentId: enrollment.id,
            couponCode: couponInfo?.code ?? null,
            originalPrice: livePrice,
            finalPrice,
            commissionBps: bps,
            platformFee: fee,
            tutorAmount,
          },
        },
      });

      // Credit tutor (if any) — net of any affiliate reward.
      if (course.tutorId && tutorNet > 0) {
        await tx.user.update({
          where: { id: course.tutorId },
          data: {
            cashBalance: { increment: tutorNet },
            totalEarnings: { increment: tutorNet },
          },
        });
        await tx.transaction.create({
          data: {
            userId: course.tutorId,
            type: TransactionType.COURSE_TUTOR_EARNING,
            status: TransactionStatus.COMPLETED,
            amount: tutorNet,
            points: 0,
            description: `Course earning — "${course.title}"`,
            reference: `course_${course.id}_${enrollment.id}`,
            metadata: {
              courseId: course.id,
              enrollmentId: enrollment.id,
              commissionBps: bps,
              platformFee: fee,
              fromUserId: session.user.id,
              affiliateUserId: affiliateId,
              affiliateAmount,
            },
          },
        });
        await tx.tutorProfile.updateMany({
          where: { userId: course.tutorId },
          data: {
            totalStudents: { increment: 1 },
            totalEarningsCents: { increment: Math.round(tutorNet * 100) },
          },
        });
      } else if (course.tutorId) {
        // Tutor nets 0 (affiliate took the whole cut) — still count the student.
        await tx.tutorProfile.updateMany({
          where: { userId: course.tutorId },
          data: { totalStudents: { increment: 1 } },
        });
      }

      // Affiliate payout (from the tutor's cut).
      if (affiliateId && affiliateAmount > 0) {
        await tx.user.update({
          where: { id: affiliateId },
          data: {
            cashBalance: { increment: affiliateAmount },
            totalEarnings: { increment: affiliateAmount },
          },
        });
        await tx.transaction.create({
          data: {
            userId: affiliateId,
            type: TransactionType.AFFILIATE_COMMISSION,
            status: TransactionStatus.COMPLETED,
            amount: affiliateAmount,
            points: 0,
            description: `Affiliate commission — "${course.title}"`,
            reference: `affiliate_course_${enrollment.id}`,
            metadata: {
              courseId: course.id,
              enrollmentId: enrollment.id,
              saleAmount: finalPrice,
              fromBuyerId: session.user.id,
            },
          },
        });
        await tx.affiliateCommission.create({
          data: {
            affiliateUserId: affiliateId,
            sourceType: "COURSE",
            sourceId: course.id,
            orderRef: enrollment.id,
            buyerId: session.user.id,
            saleAmount: finalPrice,
            commissionAmount: affiliateAmount,
          },
        });
      }

      // Course counters
      await tx.course.update({
        where: { id: course.id },
        data: {
          enrollmentCount: { increment: 1 },
          totalRevenueCents: { increment: Math.round(finalPrice * 100) },
        },
      });

      // Coupon counter
      if (couponInfo) {
        await tx.courseCoupon.update({
          where: { id: couponInfo.id },
          data: { redemptionsCount: { increment: 1 } },
        });
      }

      return { enrollment };
    });

    await fireEnrolNotifications({
      courseId: course.id,
      courseTitle: course.title,
      tutorId: course.tutorId,
      buyerId: session.user.id,
      enrollmentId: result.enrollment.id,
      amount: finalPrice,
      tutorAmount: tutorNet,
    });

    return NextResponse.json({
      enrollment: result.enrollment,
      amountPaid: finalPrice,
      discount: couponInfo?.discount ?? 0,
    });
  } catch (error) {
    // Retry/double-submit reuses reference `course_<courseId>_<enrollmentId>` →
    // P2002; the enrolment already settled, so report success not a 500.
    if (isDuplicateLedgerError(error)) {
      return NextResponse.json({ alreadyEnrolled: true, duplicate: true });
    }
    console.error("Enroll failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
  });
}

async function fireEnrolNotifications(opts: {
  courseId: string;
  courseTitle: string;
  tutorId: string | null;
  buyerId: string;
  enrollmentId: string;
  amount: number;
  tutorAmount?: number;
}) {
  if (opts.tutorId) {
    await prisma.notification.create({
      data: {
        userId: opts.tutorId,
        type: NotificationType.COURSE,
        title:
          opts.amount > 0
            ? `New paid enrolment — +$${(opts.tutorAmount ?? 0).toFixed(2)}`
            : "A new student enrolled",
        message: `Someone just enrolled in "${opts.courseTitle}".`,
        data: {
          courseId: opts.courseId,
          enrollmentId: opts.enrollmentId,
          amount: opts.amount,
        },
      },
    });
  }
  await prisma.notification.create({
    data: {
      userId: opts.buyerId,
      type: NotificationType.COURSE,
      title: "You're enrolled 🎓",
      message: `Welcome to "${opts.courseTitle}". Jump in via My Learning whenever you're ready.`,
      data: {
        courseId: opts.courseId,
        enrollmentId: opts.enrollmentId,
        amount: opts.amount,
      },
    },
  });
}
