import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import type { CouponType, CouponScope } from "@/generated/prisma";

export interface CouponValidationOk {
  valid: true;
  coupon: {
    id: string;
    code: string;
    type: CouponType;
    value: number;
    scope: CouponScope;
  };
  /** Discount amount in dollars. */
  discount: number;
  /** Final price after the discount, clamped at 0. */
  finalPrice: number;
}

export interface CouponValidationFail {
  valid: false;
  reason: string;
}

export type CouponValidationResult = CouponValidationOk | CouponValidationFail;

/** Validate that a coupon code can be redeemed by `userId` against the
 *  given course. Returns the discount + final price on success. */
export async function validateCoupon(opts: {
  code: string;
  courseId: string;
  userId: string;
}): Promise<CouponValidationResult> {
  const code = opts.code.trim().toUpperCase();
  if (!code) return { valid: false, reason: "Enter a coupon code" };

  const coupon = await prisma.courseCoupon.findUnique({ where: { code } });
  if (!coupon) return { valid: false, reason: "Coupon not found" };
  if (!coupon.isActive) return { valid: false, reason: "Coupon is inactive" };

  const now = new Date();
  if (coupon.validFrom > now) {
    return { valid: false, reason: "Coupon not active yet" };
  }
  if (coupon.validUntil && coupon.validUntil < now) {
    return { valid: false, reason: "Coupon expired" };
  }
  if (
    coupon.maxRedemptions !== null &&
    coupon.redemptionsCount >= coupon.maxRedemptions
  ) {
    return { valid: false, reason: "Coupon redemption limit reached" };
  }
  // Per-user usage cap: count completed enrollments by this user with this code
  if (coupon.perUserLimit > 0) {
    const used = await prisma.courseEnrollment.count({
      where: { userId: opts.userId, couponCode: code },
    });
    if (used >= coupon.perUserLimit) {
      return {
        valid: false,
        reason: "You've already used this coupon the max number of times",
      };
    }
  }

  // Look up the course + scope check
  const course = await prisma.course.findUnique({
    where: { id: opts.courseId },
    select: {
      id: true,
      isFree: true,
      price: true,
      discountPrice: true,
      categoryId: true,
    },
  });
  if (!course) return { valid: false, reason: "Course not found" };
  if (course.isFree) {
    return { valid: false, reason: "This course is already free" };
  }
  const livePrice = toNum(course.discountPrice ?? course.price);
  if (livePrice <= 0) {
    return { valid: false, reason: "Nothing to discount" };
  }
  if (coupon.minPurchase !== null && livePrice < toNum(coupon.minPurchase)) {
    return {
      valid: false,
      reason: `Minimum purchase of $${toNum(coupon.minPurchase).toFixed(2)} required`,
    };
  }
  if (coupon.scope === "CATEGORY") {
    if (!course.categoryId || !coupon.categoryIds.includes(course.categoryId)) {
      return { valid: false, reason: "Coupon doesn't apply to this category" };
    }
  } else if (coupon.scope === "SPECIFIC_COURSES") {
    if (!coupon.courseIds.includes(course.id)) {
      return { valid: false, reason: "Coupon doesn't apply to this course" };
    }
  }

  const discount =
    coupon.type === "PERCENT"
      ? Math.round(livePrice * (coupon.value / 100) * 100) / 100
      : Math.min(coupon.value, livePrice);
  const finalPrice = Math.max(0, Math.round((livePrice - discount) * 100) / 100);

  return {
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      scope: coupon.scope,
    },
    discount,
    finalPrice,
  };
}
