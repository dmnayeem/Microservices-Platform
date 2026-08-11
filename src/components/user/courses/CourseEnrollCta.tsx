"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { promptDialog } from "@/lib/confirm";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import {
  Loader2,
  Heart,
  HeartOff,
  PlayCircle,
  Clock,
  ListChecks,
  Award,
  Wallet,
  Tag,
  Check,
  X,
  RefreshCcw,
} from "lucide-react";

interface Props {
  courseId: string;
  slug: string | null;
  title: string;
  isFree: boolean;
  price: number;
  originalPrice: number | null;
  discountPrice: number | null;
  thumbnail: string | null;
  promoVideoUrl: string | null;
  isEnrolled: boolean;
  isBookmarked: boolean;
  certificateEnabled: boolean;
  totalLessons: number;
  totalDuration: number;
}

export function CourseEnrollCta({
  courseId,
  isFree,
  price,
  originalPrice,
  discountPrice,
  thumbnail,
  promoVideoUrl,
  isEnrolled,
  isBookmarked,
  certificateEnabled,
  totalLessons,
  totalDuration,
}: Props) {
  const router = useRouter();
  const [enrolling, setEnrolling] = useState(false);
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [bookmarking, setBookmarking] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [applied, setApplied] = useState<
    | { code: string; discount: number; finalPrice: number }
    | null
  >(null);
  const [refunding, setRefunding] = useState(false);

  const livePrice = discountPrice ?? price;
  const finalPrice = applied?.finalPrice ?? livePrice;

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponBusy(true);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode.trim(), courseId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (!d.valid) {
        toast.error(d.reason ?? "Coupon invalid");
        return;
      }
      setApplied({
        code: d.coupon.code,
        discount: d.discount,
        finalPrice: d.finalPrice,
      });
      toast.success(`Coupon applied — save $${d.discount.toFixed(2)}`);
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setCouponBusy(false);
    }
  };

  const clearCoupon = () => {
    setApplied(null);
    setCouponCode("");
  };

  const enroll = async () => {
    setEnrolling(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({
          couponCode: applied?.code ?? null,
          paymentMethod: "wallet",
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(
        isFree || finalPrice === 0
          ? "You're in!"
          : `Enrolled — $${(d.amountPaid ?? finalPrice).toFixed(2)} charged to your wallet`
      );
      router.push(`/learn/${courseId}`);
    } catch (err) {
      toast.error("Enrol failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setEnrolling(false);
    }
  };

  const requestRefund = async () => {
    const reason = await promptDialog({
      title: "Request a refund",
      description: "Why are you requesting a refund? (10+ characters)",
      tone: "warning",
      multiline: true,
      required: true,
      confirmLabel: "Submit request",
    });
    if (reason === null) return;
    if (reason.trim().length < 10) {
      toast.error("Reason too short");
      return;
    }
    setRefunding(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Refund request submitted");
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setRefunding(false);
    }
  };

  const toggleBookmark = async () => {
    setBookmarking(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/bookmark`, {
        method: "POST",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setBookmarked(Boolean(d.bookmarked));
      toast.success(d.bookmarked ? "Saved to wishlist" : "Removed from wishlist");
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBookmarking(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="aspect-video bg-gray-950 relative">
        {promoVideoUrl ? (
          <video
            src={promoVideoUrl}
            poster={thumbnail ?? undefined}
            controls
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : thumbnail ? (
          <Image
            src={thumbnail}
            alt=""
            fill
            sizes="360px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-gray-700">
            <PlayCircle className="w-12 h-12" />
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-baseline gap-2">
          {isFree ? (
            <p className="text-2xl font-extrabold text-emerald-300">Free</p>
          ) : (
            <>
              <p className="text-2xl font-extrabold text-white tabular-nums">
                ${finalPrice.toFixed(2)}
              </p>
              {(originalPrice ?? livePrice) > finalPrice && (
                <p className="text-sm text-gray-500 line-through tabular-nums">
                  ${(originalPrice ?? livePrice).toFixed(2)}
                </p>
              )}
              {applied && (
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  -${applied.discount.toFixed(2)}
                </span>
              )}
            </>
          )}
        </div>

        {/* Coupon — paid only, not-yet-enrolled */}
        {!isFree && !isEnrolled && (
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-2.5 space-y-1.5">
            {applied ? (
              <div className="flex items-center gap-2 text-xs">
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-emerald-200 font-mono font-bold">
                  {applied.code}
                </span>
                <span className="text-gray-500 ml-auto tabular-nums">
                  -${applied.discount.toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={clearCoupon}
                  className="text-gray-500 hover:text-rose-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) =>
                    setCouponCode(e.target.value.toUpperCase())
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCoupon();
                    }
                  }}
                  maxLength={60}
                  placeholder="Have a code?"
                  className="flex-1 px-2 py-1 bg-gray-900 border border-gray-800 rounded text-xs text-white placeholder-gray-500 font-mono uppercase focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={couponBusy || !couponCode.trim()}
                  className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-30"
                >
                  {couponBusy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "Apply"
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {isEnrolled ? (
          <Link
            href={`/learn/${courseId}`}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
          >
            <PlayCircle className="w-5 h-5" />
            Continue learning
          </Link>
        ) : (
          <button
            type="button"
            onClick={enroll}
            disabled={enrolling}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
          >
            {enrolling ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isFree ? (
              <PlayCircle className="w-5 h-5" />
            ) : (
              <Wallet className="w-5 h-5" />
            )}
            {isFree
              ? "Enrol — it's free"
              : finalPrice === 0
              ? "Enrol — fully covered"
              : `Enrol — $${finalPrice.toFixed(2)} from wallet`}
          </button>
        )}

        <button
          type="button"
          onClick={toggleBookmark}
          disabled={bookmarking}
          className={
            "w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-colors " +
            (bookmarked
              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
              : "border-gray-800 bg-gray-950 text-gray-300 hover:bg-gray-800")
          }
        >
          {bookmarking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : bookmarked ? (
            <HeartOff className="w-4 h-4" />
          ) : (
            <Heart className="w-4 h-4" />
          )}
          {bookmarked ? "Saved" : "Save to wishlist"}
        </button>

        {isEnrolled && !isFree && (
          <button
            type="button"
            onClick={requestRefund}
            disabled={refunding}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-gray-800 bg-gray-950 text-gray-400 hover:text-rose-300 hover:border-rose-500/40 text-xs font-bold disabled:opacity-50"
          >
            {refunding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="w-3.5 h-3.5" />
            )}
            Request refund
          </button>
        )}

        <ul className="text-xs text-gray-400 space-y-1.5 pt-2 border-t border-gray-800">
          <li className="inline-flex items-center gap-2">
            <ListChecks className="w-3.5 h-3.5" /> {totalLessons} lessons
          </li>
          <li className="inline-flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> {Math.round(totalDuration / 60)}h{" "}
            {totalDuration % 60}m total
          </li>
          {certificateEnabled && (
            <li className="inline-flex items-center gap-2">
              <Award className="w-3.5 h-3.5" /> Certificate on completion
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
