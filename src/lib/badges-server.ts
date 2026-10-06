import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getPointsPerUsd } from "@/lib/economy";
import { deliverToUser } from "@/lib/notify";
import { usd } from "@/lib/utils";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { requireActiveUser } from "@/lib/require-active";
import {
  BADGE_CONFIG_SETTING,
  BADGE_PERIOD_DAYS,
  BADGE_STYLE_KIND,
  isBadgeStyle,
  sanitizeBadgeConfig,
  styleLabel,
  type BadgeConfig,
} from "@/lib/badges";

/**
 * The blue badge shop: buying the badge and badge styles from the wallet,
 * choosing the style shown, auto-renew, and the hourly sweep that renews or
 * ends them.
 *
 * Money: every sale is ONE ledger row, Transaction PURCHASE with a reference
 * starting "badge_" (lib/finance/revenue.ts sums it as "Blue badges"). Paid in
 * cash it carries `amount`; paid in points it carries `points` — never both,
 * so revenue is never counted twice. The debit is a compare-and-set
 * (`balance >= price`) so a double click cannot overspend.
 *
 * A badge granted by an admin has `blueBadgeExpiresAt = null` and never
 * lapses; this file only ever ends badges it sold.
 */

export async function getBadgeConfig(): Promise<BadgeConfig> {
  return sanitizeBadgeConfig(await getSetting<unknown>(BADGE_CONFIG_SETTING, null).catch(() => null));
}

export interface BadgeState {
  active: boolean;
  /** Granted by an admin: permanent, nothing to renew. */
  permanent: boolean;
  expiresAt: string | null;
  autoRenew: boolean;
  currentStyle: string;
  styles: Array<{ style: string; expiresAt: string; autoRenew: boolean; active: boolean }>;
}

export async function getBadgeState(userId: string): Promise<BadgeState | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isBlueVerified: true,
      blueBadgeExpiresAt: true,
      blueBadgeAutoRenew: true,
      verifiedBadgeStyle: true,
      badgeStyleSubscriptions: { select: { style: true, expiresAt: true, autoRenew: true } },
    },
  });
  if (!u) return null;
  const now = Date.now();
  const active = u.isBlueVerified && (!u.blueBadgeExpiresAt || u.blueBadgeExpiresAt.getTime() > now);
  return {
    active,
    permanent: u.isBlueVerified && !u.blueBadgeExpiresAt,
    expiresAt: u.blueBadgeExpiresAt?.toISOString() ?? null,
    autoRenew: u.blueBadgeAutoRenew,
    currentStyle: u.verifiedBadgeStyle ?? "BLUE",
    styles: u.badgeStyleSubscriptions.map((s) => ({
      style: s.style,
      expiresAt: s.expiresAt.toISOString(),
      autoRenew: s.autoRenew,
      active: s.expiresAt.getTime() > now,
    })),
  };
}

type Method = "CASH" | "POINTS";
export type BuyResult = { ok: true; expiresAt: Date } | { ok: false; error: string; status: number };

const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000);

/** Debit the wallet and write the sale, inside the caller's transaction. */
async function charge(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  priceUsd: number,
  method: Method,
  pointsPerUsd: number,
  description: string,
  reference: string
) {
  if (priceUsd <= 0) return;
  if (method === "CASH") {
    const d = await tx.user.updateMany({
      where: { id: userId, cashBalance: { gte: priceUsd } },
      data: { cashBalance: { decrement: priceUsd } },
    });
    if (d.count === 0) throw new Error("INSUFFICIENT");
  } else {
    const pts = Math.ceil(priceUsd * pointsPerUsd);
    const d = await tx.user.updateMany({
      where: { id: userId, pointsBalance: { gte: pts } },
      data: { pointsBalance: { decrement: pts } },
    });
    if (d.count === 0) throw new Error("INSUFFICIENT");
  }
  await tx.transaction.create({
    data: {
      userId,
      type: "PURCHASE",
      status: "COMPLETED",
      amount: method === "CASH" ? priceUsd : 0,
      points: method === "POINTS" ? Math.ceil(priceUsd * pointsPerUsd) : 0,
      description,
      reference,
    },
  });
}

const CONFLICT: BuyResult = {
  ok: false,
  error: "This was already bought a moment ago — refresh to see it.",
  status: 409,
};

/** Map a failed purchase transaction to the user-facing result. */
function buyFailure(e: unknown, method: Method): BuyResult | null {
  if (e instanceof Error && e.message === "INSUFFICIENT") {
    return { ok: false, error: method === "CASH" ? "Not enough cash in your wallet." : "Not enough points.", status: 400 };
  }
  // The period moved under us (a concurrent buy / renewal won), or the same
  // purchase already wrote its ledger row: nothing was charged here.
  if ((e instanceof Error && e.message === "CONFLICT") || isDuplicateLedgerError(e)) return CONFLICT;
  return null;
}

/**
 * Buy (or extend by a month) the blue badge.
 *
 * Race-safe: the expiry is read once, and the write is a compare-and-set on
 * exactly that value inside the transaction — a double click, a second tab or
 * the renewal sweep running at the same moment finds it moved and charges
 * nothing (409). The ledger reference is derived from the same old expiry, so
 * even a duplicate that slipped past would collide on (userId, reference).
 */
export async function buyBadge(userId: string, method: Method): Promise<BuyResult> {
  const active = await requireActiveUser(userId);
  if (!active.ok) return { ok: false, error: active.message, status: active.httpStatus };
  const [cfg, rate, u] = await Promise.all([
    getBadgeConfig(),
    getPointsPerUsd(),
    prisma.user.findUnique({ where: { id: userId }, select: { isBlueVerified: true, blueBadgeExpiresAt: true } }),
  ]);
  if (!u) return { ok: false, error: "Account not found", status: 404 };
  if (!cfg.enabled) return { ok: false, error: "The badge shop is closed right now.", status: 403 };
  if (u.isBlueVerified && !u.blueBadgeExpiresAt) {
    return { ok: false, error: "Your verified badge is permanent — nothing to buy.", status: 400 };
  }
  const now = new Date();
  const base = u.blueBadgeExpiresAt && u.blueBadgeExpiresAt > now ? u.blueBadgeExpiresAt : now;
  const expiresAt = addDays(base, BADGE_PERIOD_DAYS);
  // Same shape the renewal sweep uses (`badge_blue_<user>_<oldExpiry>`): a
  // manual buy and a renewal of the same period collide instead of both paying.
  const reference = u.blueBadgeExpiresAt
    ? `badge_blue_${userId}_${u.blueBadgeExpiresAt.getTime()}`
    : `badge_blue_${userId}_new_${now.getTime()}`;
  try {
    await prisma.$transaction(async (tx) => {
      const cas = await tx.user.updateMany({
        where: { id: userId, isBlueVerified: u.isBlueVerified, blueBadgeExpiresAt: u.blueBadgeExpiresAt },
        data: { isBlueVerified: true, blueBadgeExpiresAt: expiresAt, blueBadgeAutoRenew: true },
      });
      if (cas.count === 0) throw new Error("CONFLICT");
      await charge(tx, userId, cfg.badgePriceUsd, method, rate, "Blue badge (1 month)", reference);
    });
  } catch (e) {
    const r = buyFailure(e, method);
    if (r) return r;
    throw e;
  }
  return { ok: true, expiresAt };
}

/** Buy (or extend by a month) one badge style. Needs an active badge. */
export async function buyStyle(userId: string, style: string, method: Method): Promise<BuyResult> {
  if (!isBadgeStyle(style) || BADGE_STYLE_KIND[style] === "included") {
    return { ok: false, error: "That style is not for sale.", status: 400 };
  }
  const active = await requireActiveUser(userId);
  if (!active.ok) return { ok: false, error: active.message, status: active.httpStatus };
  const [cfg, rate, state] = await Promise.all([getBadgeConfig(), getPointsPerUsd(), getBadgeState(userId)]);
  if (!state) return { ok: false, error: "Account not found", status: 404 };
  const conf = cfg.styles[style];
  if (!cfg.enabled || !conf?.enabled) return { ok: false, error: "That style is not on sale right now.", status: 403 };
  if (!state.active) return { ok: false, error: "Get the blue badge first — styles change how it looks.", status: 400 };

  const now = new Date();
  const owned = state.styles.find((s) => s.style === style);
  const ownedExpiry = owned ? new Date(owned.expiresAt) : null;
  const base = ownedExpiry && ownedExpiry > now ? ownedExpiry : now;
  const expiresAt = addDays(base, BADGE_PERIOD_DAYS);
  // Derived from the period being extended — the same shape the renewal sweep
  // writes — so a duplicate of this purchase collides on (userId, reference).
  const reference = ownedExpiry
    ? `badge_style_${style}_${userId}_${ownedExpiry.getTime()}`
    : `badge_style_${style}_${userId}_new`;
  const autoRenew = true; // renewal itself is cash-only — the shop says so at purchase
  try {
    await prisma.$transaction(async (tx) => {
      if (ownedExpiry) {
        // Compare-and-set on the expiry read above.
        const cas = await tx.badgeStyleSubscription.updateMany({
          where: { userId, style, expiresAt: ownedExpiry },
          data: { expiresAt, autoRenew },
        });
        if (cas.count === 0) throw new Error("CONFLICT");
      } else {
        // First purchase: the (userId, style) unique key makes a concurrent
        // second create fail instead of selling the style twice.
        try {
          await tx.badgeStyleSubscription.create({ data: { userId, style, expiresAt, autoRenew } });
        } catch (err) {
          if ((err as { code?: unknown } | null)?.code === "P2002") throw new Error("CONFLICT");
          throw err;
        }
      }
      await charge(tx, userId, conf.priceUsd, method, rate, `Badge style: ${styleLabel(style)} (1 month)`, reference);
      // Show what was just bought.
      await tx.user.update({ where: { id: userId }, data: { verifiedBadgeStyle: style } });
    });
  } catch (e) {
    const r = buyFailure(e, method);
    if (r) return r;
    throw e;
  }
  return { ok: true, expiresAt };
}

/** Choose which owned style the badge shows. BLUE is always allowed. */
export async function applyStyle(userId: string, style: string): Promise<{ ok: boolean; error?: string }> {
  if (!isBadgeStyle(style)) return { ok: false, error: "Unknown style" };
  const state = await getBadgeState(userId);
  if (!state?.active) return { ok: false, error: "You need an active blue badge." };
  // A permanent (admin-granted) badge keeps whatever style the admin set; the
  // holder may still switch among styles they own.
  if (style !== "BLUE" && !state.styles.some((s) => s.style === style && s.active)) {
    return { ok: false, error: "Buy this style first." };
  }
  await prisma.user.update({ where: { id: userId }, data: { verifiedBadgeStyle: style } });
  return { ok: true };
}

export async function setAutoRenew(userId: string, item: string, on: boolean): Promise<{ ok: boolean; error?: string }> {
  if (item === "badge") {
    await prisma.user.update({ where: { id: userId }, data: { blueBadgeAutoRenew: on } });
    return { ok: true };
  }
  const r = await prisma.badgeStyleSubscription.updateMany({ where: { userId, style: item }, data: { autoRenew: on } });
  return r.count ? { ok: true } : { ok: false, error: "You do not own that style." };
}

/**
 * Hourly: renew what is due and paid for, end the rest. Renewal is paid from
 * CASH only (points move too much to be charged without the user present).
 * A lapsed badge also drops its paid style back to blue.
 */
export async function runBadgeExpiry(limit = 200): Promise<{ renewed: number; ended: number; drained: boolean }> {
  const now = new Date();
  const cfg = await getBadgeConfig();
  const rate = await getPointsPerUsd();
  let renewed = 0;
  let ended = 0;

  const badges = await prisma.user.findMany({
    where: { isBlueVerified: true, blueBadgeExpiresAt: { not: null, lte: now } },
    select: { id: true, blueBadgeExpiresAt: true, blueBadgeAutoRenew: true },
    take: limit,
  });
  for (const u of badges) {
    let ok = false;
    if (u.blueBadgeAutoRenew && cfg.enabled) {
      try {
        await prisma.$transaction(async (tx) => {
          // Claim the period first so two overlapping runs cannot both charge.
          const claim = await tx.user.updateMany({
            where: { id: u.id, blueBadgeExpiresAt: u.blueBadgeExpiresAt },
            data: { blueBadgeExpiresAt: addDays(now, BADGE_PERIOD_DAYS) },
          });
          if (claim.count === 0) throw new Error("RACE");
          await charge(tx, u.id, cfg.badgePriceUsd, "CASH", rate, "Blue badge renewal (1 month)", `badge_blue_${u.id}_${u.blueBadgeExpiresAt!.getTime()}`);
        });
        ok = true;
        renewed++;
        void deliverToUser({ category: "billing", userId: u.id, title: "Blue badge renewed", message: `Your blue badge renewed for ${usd(cfg.badgePriceUsd)}.`, link: "/badge" });
      } catch (e) {
        if (e instanceof Error && e.message === "RACE") continue;
      }
    }
    if (!ok) {
      const r = await prisma.user.updateMany({
        where: { id: u.id, blueBadgeExpiresAt: u.blueBadgeExpiresAt },
        data: { isBlueVerified: false, verifiedBadgeStyle: "BLUE" },
      });
      if (r.count) {
        ended++;
        void deliverToUser({ category: "billing",
          userId: u.id,
          title: "Blue badge ended",
          message: u.blueBadgeAutoRenew
            ? "Your blue badge could not renew — there was not enough cash in your wallet. Get it again any time."
            : "Your blue badge has ended. Get it again any time.",
          link: "/badge",
        });
      }
    }
  }

  // Only rows due and not yet processed: a renewal pushes expiresAt forward;
  // an ending touches the row AFTER its expiry (updatedAt > expiresAt), so it
  // is never picked up again. Prisma cannot compare two columns, hence SQL.
  const dueIds = (
    await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "BadgeStyleSubscription"
      WHERE "expiresAt" <= ${now} AND "updatedAt" <= "expiresAt"
      LIMIT ${limit}`
  ).map((r) => r.id);
  const styles = await prisma.badgeStyleSubscription.findMany({
    where: { id: { in: dueIds } },
    select: { id: true, userId: true, style: true, expiresAt: true, autoRenew: true, user: { select: { isBlueVerified: true, verifiedBadgeStyle: true, blueBadgeExpiresAt: true } } },
    take: limit,
  });
  for (const s of styles) {
    const conf = cfg.styles[s.style];
    const badgeActive = s.user.isBlueVerified && (!s.user.blueBadgeExpiresAt || s.user.blueBadgeExpiresAt > now);
    let ok = false;
    if (s.autoRenew && badgeActive && cfg.enabled && conf?.enabled) {
      try {
        await prisma.$transaction(async (tx) => {
          const claim = await tx.badgeStyleSubscription.updateMany({
            where: { id: s.id, expiresAt: s.expiresAt },
            data: { expiresAt: addDays(now, BADGE_PERIOD_DAYS) },
          });
          if (claim.count === 0) throw new Error("RACE");
          await charge(tx, s.userId, conf.priceUsd, "CASH", rate, `Badge style renewal: ${styleLabel(s.style)}`, `badge_style_${s.style}_${s.userId}_${s.expiresAt.getTime()}`);
        });
        ok = true;
        renewed++;
      } catch (e) {
        if (e instanceof Error && e.message === "RACE") continue;
      }
    }
    if (!ok) {
      // The row stays (history, one-click re-buy); it is simply expired.
      // This write sets updatedAt past expiresAt, which marks it processed.
      // Showing it stops: fall back to blue if it was the shown style.
      await prisma.badgeStyleSubscription.updateMany({ where: { id: s.id, expiresAt: s.expiresAt }, data: { autoRenew: false } });
      if (s.user.verifiedBadgeStyle === s.style) {
        await prisma.user.update({ where: { id: s.userId }, data: { verifiedBadgeStyle: "BLUE" } });
      }
      ended++;
    }
  }
  return { renewed, ended, drained: badges.length < limit && dueIds.length < limit };
}
