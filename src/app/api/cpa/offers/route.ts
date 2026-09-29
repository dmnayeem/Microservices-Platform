import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CPA_COUNTED_STATUSES,
  cpaDayStart,
  cpaGate,
  cpaReasonMessage,
  cpaVisibleWhere,
  getCpaRetryHours,
  loadCpaViewer,
} from "@/lib/cpa/eligibility";
import { CPA_MY_CONVERSION_SELECT, CPA_PUBLIC_OFFER_SELECT, toPublicCpaOffer } from "@/lib/cpa/public";

// GET /api/cpa/offers — the CPA offers this user may do, plus the ones they
// already have a conversion on (with its status).
//
// { offers: [{ ...offer, available: boolean, reason: string|null,
//              message: string|null, retryAt: string|null, my: Conversion|null }] }
// `available` false + reason "ALREADY" = done/pending; "RETRY_LATER" = rejected,
// retryable at `retryAt`; `available` true with a REJECTED `my` = may retry now.
// A capped offer the user never started is left out entirely.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Super-admin page visibility: refuse when /cpa is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/cpa");
  if (pageHidden) return pageHidden;

  const viewer = await loadCpaViewer(session.user.id);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [visible, mine, retryHours] = await Promise.all([
    prisma.cpaOffer.findMany({
      where: cpaVisibleWhere(viewer),
      select: CPA_PUBLIC_OFFER_SELECT,
      orderBy: [{ featured: "desc" }, { order: "asc" }, { createdAt: "desc" }],
      take: 300,
    }),
    prisma.cpaConversion.findMany({
      where: { userId: viewer.id },
      select: CPA_MY_CONVERSION_SELECT,
    }),
    getCpaRetryHours(),
  ]);
  const myBy = new Map(mine.map((c) => [c.offerId, c]));

  // Offers the user already converted on but can no longer "see" (paused,
  // retargeted) still belong in their list, so they can follow the status.
  const missing = mine.map((c) => c.offerId).filter((id) => !visible.some((o) => o.id === id));
  const extra = missing.length
    ? await prisma.cpaOffer.findMany({
        where: { id: { in: missing }, status: { not: "DRAFT" } },
        select: CPA_PUBLIC_OFFER_SELECT,
      })
    : [];

  const dailyIds = visible.filter((o) => o.dailyCap != null).map((o) => o.id);
  const today = dailyIds.length
    ? ((await prisma.cpaConversion.groupBy({
        by: ["offerId"],
        where: {
          offerId: { in: dailyIds },
          status: { in: CPA_COUNTED_STATUSES },
          createdAt: { gte: cpaDayStart() },
        },
        _count: { _all: true },
      })) as unknown as { offerId: string; _count: { _all: number } }[])
    : [];
  const todayBy = new Map(today.map((t) => [t.offerId, t._count._all]));

  const offers = [...visible, ...extra]
    .map((o) => {
      const my = myBy.get(o.id) ?? null;
      const gate = cpaGate(o, viewer, { mine: my, todayCount: todayBy.get(o.id) ?? 0, retryHours });
      return {
        ...toPublicCpaOffer(o),
        available: gate.ok,
        reason: gate.ok ? null : gate.reason,
        message: gate.ok ? null : cpaReasonMessage(gate),
        retryAt: !gate.ok && gate.retryAt ? gate.retryAt.toISOString() : null,
        my,
      };
    })
    // Capped / not-for-you offers the user never touched are just noise.
    .filter((o) => o.available || o.my);

  return NextResponse.json({ offers });
}
