import { usd } from "@/lib/utils";
import "server-only";
import { NotificationType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { writeAudit } from "@/lib/audit";
import { getAdClickCost } from "@/lib/ad-billing";
import { refundCampaignBudgetToCredit } from "@/lib/ad-credits";
import { toNum } from "@/lib/money";

/**
 * Campaign lifecycle sweep.
 *
 * Nothing used to end a campaign at its `endAt`: it just stopped matching the
 * serve query and sat ACTIVE forever with its remaining budget locked up — real
 * money the advertiser could not get back. This closes that, plus the two other
 * states that should stop delivery (a suspended advertiser, an exhausted
 * budget), and tells the advertiser each time instead of leaving them guessing.
 */

const BATCH = 50;

/** Notify at most once per key — cron runs often; advertisers shouldn't be spammed. */
async function notifyOnce(opts: {
  userId: string;
  dedupKey: string;
  title: string;
  message: string;
  withinDays?: number;
}) {
  const since = new Date(Date.now() - (opts.withinDays ?? 7) * 86_400_000);
  const existing = await prisma.notification
    .findFirst({
      where: {
        userId: opts.userId,
        createdAt: { gte: since },
        data: { path: ["dedupKey"], equals: opts.dedupKey } as Prisma.JsonFilter,
      },
      select: { id: true },
    })
    .catch(() => null);
  if (existing) return false;

  await notifyUser({
    userId: opts.userId,
    type: NotificationType.SYSTEM,
    title: opts.title,
    message: opts.message,
    link: "/advertiser",
    data: { dedupKey: opts.dedupKey },
  }).catch(() => {});
  return true;
}

export async function runAdCampaignSweep(): Promise<Record<string, number>> {
  const now = new Date();
  const cpc = await getAdClickCost();
  const result = { ended: 0, refundedUsd: 0, pausedNoBudget: 0, pausedAdvertiser: 0, warned: 0 };

  // 1. Past their end date → ENDED + refund the unspent budget.
  const expired = await prisma.adCampaign.findMany({
    where: { status: "ACTIVE", endAt: { not: null, lt: now } },
    select: { id: true, title: true, advertiserId: true },
    take: BATCH,
  });
  for (const c of expired) {
    await prisma.adCampaign.update({ where: { id: c.id }, data: { status: "ENDED" } });
    const refunded = await refundCampaignBudgetToCredit(c.id).catch(() => 0);
    result.ended++;
    result.refundedUsd += refunded;
    if (c.advertiserId) {
      await notifyOnce({
        userId: c.advertiserId,
        dedupKey: `campaign_ended_${c.id}`,
        title: "Campaign ended",
        message: `"${c.title}" reached its end date.${refunded > 0 ? ` ${usd(refunded)} was returned to your Ad Credit.` : ""}`,
      });
    }
    await writeAudit({
      actorId: null,
      action: "AD_CAMPAIGN_AUTO_ENDED",
      entity: "AdCampaign",
      entityId: c.id,
      targetUserId: c.advertiserId,
      summary: `Auto-ended "${c.title}" at its end date${refunded ? ` — refunded ${usd(refunded)}` : ""}`,
      meta: { refunded },
    });
  }

  // 2. Advertiser no longer in good standing → pause, don't keep spending.
  const suspended = await prisma.adCampaign.findMany({
    where: { status: "ACTIVE", advertiser: { is: { status: { not: "ACTIVE" } } } },
    select: { id: true, title: true, advertiserId: true },
    take: BATCH,
  });
  for (const c of suspended) {
    await prisma.adCampaign.update({ where: { id: c.id }, data: { status: "PAUSED" } });
    result.pausedAdvertiser++;
    await writeAudit({
      actorId: null,
      action: "AD_CAMPAIGN_AUTO_PAUSED",
      entity: "AdCampaign",
      entityId: c.id,
      targetUserId: c.advertiserId,
      summary: `Auto-paused "${c.title}" — the advertiser's account isn't active`,
      meta: { reason: "ADVERTISER_NOT_ACTIVE" },
    });
  }

  // 3. Out of budget → pause. `recordClick` only catches this on the next click,
  //    so a campaign with dust left could linger in rotation indefinitely.
  const broke = await prisma.adCampaign.findMany({
    where: { status: "ACTIVE", isHouse: false, budget: { lt: cpc } },
    select: { id: true, title: true, advertiserId: true },
    take: BATCH,
  });
  for (const c of broke) {
    await prisma.adCampaign.update({ where: { id: c.id }, data: { status: "PAUSED" } });
    result.pausedNoBudget++;
    if (c.advertiserId) {
      await notifyOnce({
        userId: c.advertiserId,
        dedupKey: `campaign_out_of_budget_${c.id}`,
        title: "Campaign out of budget",
        message: `"${c.title}" ran out of budget and is paused. Add budget to start it again.`,
        withinDays: 3,
      });
    }
    await writeAudit({
      actorId: null,
      action: "AD_CAMPAIGN_AUTO_PAUSED",
      entity: "AdCampaign",
      entityId: c.id,
      targetUserId: c.advertiserId,
      summary: `Auto-paused "${c.title}" — out of budget`,
      meta: { reason: "OUT_OF_BUDGET" },
    });
  }

  // 4. Early warnings: ≥80% of the funded budget spent, or ending within 24h.
  const running = await prisma.adCampaign.findMany({
    where: { status: "ACTIVE", isHouse: false, advertiserId: { not: null } },
    select: { id: true, title: true, advertiserId: true, budget: true, spentTotal: true, endAt: true },
    take: 200,
  });
  const soon = new Date(now.getTime() + 86_400_000);
  for (const c of running) {
    if (!c.advertiserId) continue;
    const remaining = toNum(c.budget);
    const spent = toNum(c.spentTotal);
    const funded = remaining + spent;
    if (funded > 0 && remaining / funded <= 0.2) {
      if (
        await notifyOnce({
          userId: c.advertiserId,
          dedupKey: `campaign_budget_low_${c.id}`,
          title: "Campaign budget almost gone",
          message: `"${c.title}" has ${usd(remaining)} left of ${usd(funded)}. Add budget to keep it running.`,
          withinDays: 3,
        })
      ) {
        result.warned++;
      }
    }
    if (c.endAt && c.endAt > now && c.endAt <= soon) {
      if (
        await notifyOnce({
          userId: c.advertiserId,
          dedupKey: `campaign_ending_${c.id}`,
          title: "Campaign ends tomorrow",
          message: `"${c.title}" stops running on ${c.endAt.toLocaleDateString()}. Any unspent budget goes back to your Ad Credit.`,
        })
      ) {
        result.warned++;
      }
    }
  }

  return result;
}

/**
 * Daily nudge so a submission never sits unseen: tell the reviewers when
 * anything has been pending for more than a day.
 */
export async function runAdReviewSla(): Promise<{ stale: number }> {
  const cutoff = new Date(Date.now() - 86_400_000);
  const stale = await prisma.ad.count({
    where: { status: "PENDING", OR: [{ submittedAt: { lt: cutoff } }, { submittedAt: null, createdAt: { lt: cutoff } }] },
  });
  if (stale === 0) return { stale: 0 };

  const admins = await prisma.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN", "MARKETING_ADMIN", "AD_MANAGER"] } },
    select: { id: true },
    take: 25,
  });
  await Promise.all(
    admins.map((a) =>
      notifyOnce({
        userId: a.id,
        dedupKey: `ad_review_sla_${new Date().toISOString().slice(0, 10)}`,
        title: "Ads waiting for review",
        message: `${stale} ad${stale > 1 ? "s have" : " has"} been pending for more than a day.`,
        withinDays: 1,
      })
    )
  );
  return { stale };
}
