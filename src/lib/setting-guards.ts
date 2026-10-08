/**
 * Bounds for the numeric SystemSetting keys where a typo is expensive.
 *
 * `POST /api/admin/settings` used to upsert **any** key with **any** value, no
 * validation and no audit row. The worst of those keys is `points_per_usd` —
 * it is how many points equal one dollar, and every money boundary reads it
 * (withdrawals, the USD mirror written at earn time, ad credits). Typing `1`
 * where `1000` was meant revalues every balance on the platform by 1000×
 * instantly: a 10,000-point balance becomes $10,000 instead of $10.
 *
 * Deliberately a *rejection*, not a silent clamp: an admin who typed the wrong
 * number should be told, not quietly corrected into a third value they also
 * didn't choose. `getPointsPerUsd()` clamps separately as a runtime safety net
 * for values that reached the row some other way.
 *
 * Prisma-free so verification scripts can import it.
 */
import { NAV_SETTING_KEYS, navSettingProblems } from "@/lib/nav-config";

export interface SettingBound {
  min: number;
  max: number;
  /** Reject a fractional value. */
  integer?: boolean;
  /** Human name for the error message. */
  label: string;
  /** Why the bound exists — shown to the admin so the limit isn't mysterious. */
  why: string;
}

export const POINTS_PER_USD_MIN = 10;
export const POINTS_PER_USD_MAX = 1_000_000;

export const NUMERIC_SETTING_BOUNDS: Record<string, SettingBound> = {
  "bonus.welcome_points": {
    min: 0,
    max: 100_000,
    integer: true,
    label: "New user welcome bonus (points)",
    why: "Paid once to every new account — a stray extra zero would pay it to everyone.",
  },
  "pwa.install_reward_points": {
    min: 0,
    max: 100_000,
    integer: true,
    label: "App install reward (points)",
    why: "Paid once to every user who installs the app — a stray extra zero would pay it to everyone.",
  },
  "pwa.install_reward_min_days": {
    min: 1,
    max: 30,
    integer: true,
    label: "App install reward: days the app must be opened",
    why: "At least 1. Two or more means a single faked request is never enough to get paid.",
  },
  "cpa.retry_after_hours": {
    min: 0,
    max: 720,
    integer: true,
    label: "CPA retry wait after a rejection (hours)",
    why: "0 lets a rejected user retry at once; more than 30 days is no retry at all.",
  },
  points_per_usd: {
    min: POINTS_PER_USD_MIN,
    max: POINTS_PER_USD_MAX,
    label: "Points per USD",
    why: "This revalues every balance on the platform. Below 10 would make a single point worth more than 10 cents.",
  },
  min_withdrawal: {
    min: 0,
    max: 1_000_000,
    label: "Minimum withdrawal",
    why: "Money columns are Decimal(18, 6).",
  },
  max_withdrawal: {
    min: 0,
    max: 1_000_000,
    label: "Maximum withdrawal",
    why: "Money columns are Decimal(18, 6).",
  },
  withdrawal_fee_percent: {
    min: 0,
    max: 100,
    label: "Withdrawal fee",
    why: "It is a percentage.",
  },
  "marketplace.fee_percent": {
    min: 0,
    max: 100,
    label: "Marketplace fee",
    why: "It is a percentage. Above 100 the seller would owe money on a sale.",
  },
  vat_pct: { min: 0, max: 100, label: "VAT", why: "It is a percentage." },
  "ads.credit_bonus_pct": {
    min: 0,
    max: 100,
    label: "Ad credit bonus",
    why: "It is a percentage.",
  },
  "antifraud.auto_suspend_at": {
    min: 10,
    max: 100,
    integer: true,
    label: "Auto-suspend at",
    why: "It is a percentage of fraud risk. Below 10 one slip would suspend an honest user.",
  },
  "antifraud.max_users_per_ip": {
    min: 1,
    max: 10_000,
    integer: true,
    label: "Max accounts per IP",
    why: "0 would lock every user out of the platform.",
  },
  "security.outbound_domain_per_min": {
    min: 1,
    max: 10_000,
    integer: true,
    label: "Outbound fetches per site per minute",
    why: "Below 1 the server could never read a link. The hourly cap is 20× this.",
  },
  "security.outbound_user_per_hour": {
    min: 1,
    max: 100_000,
    integer: true,
    label: "Outbound fetches per user per hour",
    why: "Below 1 no user's link could ever be read, so every proof would go to manual review.",
  },
  "ads.interstitial_min_gap_sec": {
    min: 0,
    max: 3600,
    integer: true,
    label: "Minimum gap between full-screen ads",
    why: "Seconds. 0 disables the gap, which means back-to-back full-screen ads.",
  },
  "ads.interstitial_daily_max": {
    min: 0,
    max: 500,
    integer: true,
    label: "Full-screen ads per user per day",
    why: "0 disables the cap entirely.",
  },
  "ads.cpcUsd": {
    min: 0.001,
    max: 100,
    label: "Cost per click",
    why: "It is the price of a click in every ad space with no rate of its own — today, all 29 of them — so it moves real money across the whole inventory.",
  },
  "bkash.usdToBdtRate": {
    min: 50,
    max: 500,
    label: "bKash taka per US dollar",
    why: "A bKash deposit is charged in taka at this rate and credited in dollars — a rate of 1 would sell $10 of wallet money for 10 taka.",
  },
  "billing.tax_pct": {
    min: 0,
    max: 100,
    label: "Invoice tax rate",
    why: "It is added to every invoice issued from now on. 0 removes the tax line entirely.",
  },
  "ai.daily_limit_per_user": {
    min: 0,
    max: 10_000,
    integer: true,
    label: "AI daily limit",
    why: "Each call costs money at the provider.",
  },
};

/**
 * Link safety settings (src/lib/link-safety.ts). Kept Prisma-free and
 * restated here rather than imported so this file stays importable anywhere.
 */
const LINK_POLICY_MODES = ["flag", "block", "off"];
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i;

function linkSafetyProblems(key: string, raw: unknown): string[] {
  if (key === "security.link_policy") {
    return typeof raw === "string" && LINK_POLICY_MODES.includes(raw)
      ? []
      : ["Link safety mode must be one of: flag, block, off."];
  }
  if (key === "security.blocked_domains") {
    if (raw === null || raw === undefined || raw === "") return [];
    // Blank lines are allowed (the editor is a textarea) and ignored.
    const list: unknown[] = (
      Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,]+/) : [raw]
    ).filter((d) => !(typeof d === "string" && d.trim() === ""));
    if (list.length > 5000) return ["The blocked-domain list is limited to 5,000 domains."];
    const bad = list.filter(
      (d) =>
        typeof d !== "string" ||
        !DOMAIN_RE.test(
          d
            .trim()
            .toLowerCase()
            .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
            .split(/[/?#]/)[0]
            .replace(/:\d+$/, "")
            .replace(/^\*?\./, "")
        )
    );
    return bad.length > 0
      ? [`These are not domain names: ${bad.slice(0, 5).map(String).join(", ")}. Enter one domain per line, like bad-site.com.`]
      : [];
  }
  if (key === "security.safe_browsing_api_key") {
    if (raw === null || raw === undefined || raw === "") return [];
    return typeof raw === "string" && raw.trim().length <= 200 && !/\s/.test(raw.trim())
      ? []
      : ["The Safe Browsing API key looks wrong — paste just the key, with no spaces."];
  }
  return [];
}

export const LINK_SAFETY_SETTING_KEYS = [
  "security.link_policy",
  "security.blocked_domains",
  "security.safe_browsing_api_key",
];

/** Keys whose value must be one of a fixed set of choices. */
export const ENUM_SETTING_CHOICES: Record<string, { label: string; values: string[] }> = {
  "security.upload_archive_policy": {
    label: "Suspicious uploads policy",
    values: ["review", "block", "allow"],
  },
};

/**
 * `referral_bonus_config` is one JSON blob saved through the generic settings
 * route, and every number in it is paid out: points to referrers and invitees,
 * and a percentage of every deposit / withdrawal. Nothing bounded them, so one
 * extra zero minted points platform-wide.
 */
const REFERRAL_POINT_FIELDS = [
  "signupPoints",
  "inviteePoints",
  "subscriptionPoints",
  "purchasePoints",
  "monthlyPoints",
];
const REFERRAL_POINTS_MAX = 100_000;
const REFERRAL_MONEY_CAP_MAX = 1_000_000;

function referralBonusProblems(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return ["Referral bonus settings are malformed."];
  }
  const cfg = raw as Record<string, unknown>;
  const out: string[] = [];
  const check = (v: unknown, max: number, label: string) => {
    if (v === undefined || v === null || v === "") return;
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > max) {
      out.push(`${label} must be between 0 and ${max.toLocaleString()}.`);
    }
  };
  for (const f of REFERRAL_POINT_FIELDS) check(cfg[f], REFERRAL_POINTS_MAX, `Referral ${f}`);
  check(cfg.depositPercent, 100, "Referral deposit bonus %");
  check(cfg.withdrawalPercent, 100, "Referral withdrawal bonus %");
  check(cfg.moneyBonusMaxPointsPerUser, REFERRAL_MONEY_CAP_MAX, "Referral money-bonus cap per user");
  if (Array.isArray(cfg.milestones)) {
    cfg.milestones.forEach((m, i) =>
      check((m as { points?: unknown } | null)?.points, REFERRAL_POINTS_MAX, `Referral milestone ${i + 1} points`)
    );
  }
  return out;
}

export interface SettingRejection {
  key: string;
  message: string;
}

/**
 * Check a `{ key: value }` bag against the bounds above. Keys with no bound
 * pass through untouched — this guards the expensive ones, it is not a
 * whitelist, so the many admin forms that write their own keys keep working.
 *
 * Returns every problem rather than the first, so an admin fixing a form sees
 * all of it at once.
 */
export function validateSettingValues(
  settings: Record<string, unknown>
): SettingRejection[] {
  const out: SettingRejection[] = [];
  for (const [key, raw] of Object.entries(settings)) {
    // Navigation menus are JSON shapes, not numbers: a malformed one would
    // otherwise be stored and then silently replaced by the defaults.
    if (NAV_SETTING_KEYS.includes(key)) {
      for (const message of navSettingProblems(key, raw)) out.push({ key, message });
      continue;
    }
    if (key === "referral_bonus_config") {
      for (const message of referralBonusProblems(raw)) out.push({ key, message });
      continue;
    }
    if (LINK_SAFETY_SETTING_KEYS.includes(key)) {
      for (const message of linkSafetyProblems(key, raw)) out.push({ key, message });
      continue;
    }
    const choices = ENUM_SETTING_CHOICES[key];
    if (choices) {
      if (raw !== null && raw !== undefined && raw !== "" && !choices.values.includes(String(raw))) {
        out.push({ key, message: `${choices.label} must be one of: ${choices.values.join(", ")}.` });
      }
      continue;
    }
    if (key === "security.virustotal_api_key" && typeof raw === "string" && raw.trim() !== "" && !/^[A-Za-z0-9]{32,128}$/.test(raw.trim())) {
      out.push({ key, message: "The VirusTotal API key should be letters and digits only (64 characters)." });
      continue;
    }
    const bound = NUMERIC_SETTING_BOUNDS[key];
    if (!bound) continue;
    if (raw === null || raw === undefined || raw === "") continue;

    const n = typeof raw === "string" ? Number(raw) : raw;
    if (typeof n !== "number" || !Number.isFinite(n)) {
      out.push({ key, message: `${bound.label} must be a number.` });
      continue;
    }
    if (bound.integer && !Number.isInteger(n)) {
      out.push({ key, message: `${bound.label} must be a whole number.` });
      continue;
    }
    if (n < bound.min || n > bound.max) {
      out.push({
        key,
        message: `${bound.label} must be between ${bound.min.toLocaleString()} and ${bound.max.toLocaleString()}. ${bound.why}`,
      });
    }
  }
  return out;
}
