import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  AFFILIATE_COOKIE,
  getAffiliateConfig,
  isAffiliateEligible,
  serializeAttribution,
  type AffiliateTarget,
} from "@/lib/affiliate";
import { toNumOrNull } from "@/lib/money";
import { clientIp } from "@/lib/rate-limit";
import { createHash } from "crypto";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(1).max(64), // affiliate's referralCode
  targetType: z.enum(["MARKETPLACE", "COURSE"]),
  targetId: z.string().min(1),
});

/**
 * Records an affiliate click and drops the attribution cookie. Called by the
 * product/course detail page when it loads with `?aff=<code>`. Open to any
 * visitor (the buyer need not be the affiliate); attribution is only honoured at
 * checkout when the reward is set and the buyer isn't the affiliate.
 */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const { code, targetType, targetId } = parsed.data;

  const cfg = await getAffiliateConfig();
  if (!cfg.enabled) return NextResponse.json({ ok: false });

  // Resolve the affiliate by referral code; must have joined the program.
  const affiliate = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true, affiliateJoinedAt: true },
  });
  if (!affiliate?.affiliateJoinedAt) return NextResponse.json({ ok: false });

  // Validate the target is affiliate-eligible and not owned by the affiliate.
  let ownerId: string | null = null;
  let eligible = false;
  if (targetType === "MARKETPLACE") {
    const l = await prisma.marketplaceListing.findUnique({
      where: { id: targetId },
      select: { sellerId: true, affiliateCommissionType: true, affiliateCommissionValue: true },
    });
    if (l) {
      ownerId = l.sellerId;
      eligible = isAffiliateEligible(l.affiliateCommissionType, toNumOrNull(l.affiliateCommissionValue));
    }
  } else {
    const c = await prisma.course.findUnique({
      where: { id: targetId },
      select: { tutorId: true, affiliateCommissionType: true, affiliateCommissionValue: true },
    });
    if (c) {
      ownerId = c.tutorId;
      eligible = isAffiliateEligible(c.affiliateCommissionType, toNumOrNull(c.affiliateCommissionValue));
    }
  }
  if (!eligible || ownerId === affiliate.id) {
    return NextResponse.json({ ok: false });
  }

  // Don't self-attribute if the visitor is the affiliate.
  const session = await auth();
  if (session?.user?.id === affiliate.id) {
    return NextResponse.json({ ok: false });
  }

  // Stable per-visitor hash (IP + UA) → total rows = views, distinct = clicks.
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const visitorHash =
    ip && ip !== "unknown"
      ? createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 32)
      : null;

  await prisma.affiliateClick
    .create({
      data: {
        affiliateUserId: affiliate.id,
        targetType,
        targetId,
        visitorHash,
      },
    })
    .catch(() => {});

  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    AFFILIATE_COOKIE,
    serializeAttribution({
      aff: affiliate.id,
      t: targetType as AffiliateTarget,
      id: targetId,
      ts: Date.now(),
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: cfg.cookieWindowDays * 24 * 60 * 60,
      path: "/",
    }
  );
  return res;
}
