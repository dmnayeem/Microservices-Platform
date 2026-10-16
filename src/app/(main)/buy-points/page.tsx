import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveFeatures } from "@/lib/packages";
import { getPointsPerUsd } from "@/lib/economy";
import { getBuyerSettings } from "@/lib/buyer-settings";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { BuyPointsView } from "@/components/user/buyer/buy-points-view";
import { toNum } from "@/lib/money";
import { getAdPointsPerUsd } from "@/lib/ad-wallet";

/**
 * Buy task credit with Ad Fund or Ad Points (owner, 2026-10-16).
 *
 * Deliberately its own page rather than a step inside task creation: a buyer
 * usually tops up once and then runs several tasks from the same pot, and
 * making them think about money every time they write a task is how a task
 * never gets written.
 */
export default async function BuyPointsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const { enabled } = await getEffectiveFeatures(userId);
  if (!enabled.has("createTasks")) {
    return <FeatureLock title="Credit" applyHref="/profile/become-creator" />;
  }

  const [buyer, pointsPerUsd, adPointsPerUsd, me] = await Promise.all([
    getBuyerSettings(),
    getPointsPerUsd(),
    getAdPointsPerUsd(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { adFundBalance: true, adPointsBalance: true, taskCreditPoints: true },
    }),
  ]);

  if (!buyer.enabled) {
    return (
      <FeatureLock
        title="Credit"
        message="Buyer task creation is turned off at the moment, so there is nothing to spend credit on yet. Please check back later."
      />
    );
  }

  return (
    <BuyPointsView
      adFundBalance={toNum(me?.adFundBalance ?? 0)}
      adPointsBalance={me?.adPointsBalance ?? 0}
      adPointsPerUsd={adPointsPerUsd}
      taskCredit={me?.taskCreditPoints ?? 0}
      pointsPerUsd={pointsPerUsd}
      minPoints={buyer.minPurchasePoints}
      maxPoints={buyer.maxPurchasePoints}
    />
  );
}
