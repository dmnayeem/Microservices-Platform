import "server-only";
import { prisma } from "@/lib/prisma";
import { SETTINGS_CATALOG, type SettingEntry } from "@/lib/admin-settings-catalog";

/**
 * The Control Center's "Feature switches": every on/off platform setting, in
 * one list, grouped by what it is about.
 *
 * Nothing here is a second store or a second list of keys. The switches ARE
 * the SETTINGS_CATALOG entries that hold a boolean, read and written as the
 * same `SystemSetting` rows the settings form and the feature pages use — so a
 * key added to the catalog appears here on its own, in the right group.
 */

export type SwitchGroupId =
  | "earning"
  | "monetization"
  | "commerce"
  | "social"
  | "security"
  | "platform";

export const SWITCH_GROUPS: { id: SwitchGroupId; label: string; blurb: string }[] = [
  { id: "earning", label: "Earning", blurb: "Tasks, offerwall, CPA, Browse & Earn, quizzes, lottery, leaderboards, events, games." },
  { id: "monetization", label: "Monetization", blurb: "Ads and ad networks, plans and subscriptions, badge shop, auto-renew, VAT, withdrawals." },
  { id: "commerce", label: "Marketplace & courses", blurb: "Marketplace, sellers, courses and tutors." },
  { id: "social", label: "Social & feed", blurb: "Feed, groups, posts, social earning." },
  { id: "security", label: "Security", blurb: "Fraud gates, KYC, sign-in and link safety." },
  { id: "platform", label: "Platform", blurb: "Everything else that is on or off site-wide." },
];

// Ordered: the first rule that matches wins. Specific before general — Browse
// & Earn is filed under ads.* but is an earning feature; a KYC requirement on
// withdrawals is a security gate, not a money setting.
const GROUP_RULES: [SwitchGroupId, RegExp][] = [
  ["earning", /browse_earn|offerwall|cpa|quiz|lottery|leaderboard|event|games?\.|tasks?\.|daily_mission|social_earning|pwa\.install_reward/i],
  ["security", /antifraud|fraud|security\.|kyc|password|email_verification|vpn|adblock|targeting\.|captcha|2fa|two_factor/i],
  ["commerce", /marketplace|course|tutor|seller|listing/i],
  ["social", /feed|social|groups?_|post|chat|follow/i],
  ["monetization", /^ads\.|ad_network|adsense|subscription|plans?\.|badge|auto_renew|vat|withdraw|buyer\.|payroll|deposit|bkash|sslcommerz/i],
];

export function switchGroupOf(key: string): SwitchGroupId {
  for (const [g, re] of GROUP_RULES) if (re.test(key)) return g;
  return "platform";
}

// What a boolean key looks like by name, for keys with no row yet.
const SWITCH_NAME =
  /(enabled|Enabled)$|(^|[._])(allow|require|requires|notify|block)_|_user_choice$|^maintenance_mode$|auto_approve|sequential_unlock|country_ip_only|refund_fee_on_reject/;

/** Settings rows are stored raw or wrapped as `{ v: value }`. */
export function unwrapSetting(v: unknown): unknown {
  return v && typeof v === "object" && !Array.isArray(v) && "v" in (v as object)
    ? (v as { v: unknown }).v
    : v;
}

function isSwitchEntry(e: SettingEntry, stored: unknown): boolean {
  if (e.secret) return false;
  if (e.kind) return e.kind === "switch";
  if (stored !== undefined) return typeof unwrapSetting(stored) === "boolean";
  return !e.unit && SWITCH_NAME.test(e.key);
}

/**
 * On/off settings that are NOT plain catalog rows, so the catalog scan above
 * never found them — each has its own editor on its feature page and was
 * missing here (owner, 2026-10-09). Same rows, same shape: a plain boolean,
 * or the `enabled` field inside a JSON config (`jsonField`).
 */
interface ExtraSwitch {
  key: string;
  label: string;
  description: string;
  group: SwitchGroupId;
  home: { href: string; where: string };
  /** What the code does when the row does not exist yet. */
  def: boolean;
  /** Row category used by the feature's own editor. */
  category: string;
  /** The switch is this field of a JSON object row. */
  jsonField?: "enabled";
  danger?: string;
}

const EXTRA_SWITCHES: ExtraSwitch[] = [
  { key: "ads.browse_earn_enabled", label: "Browse & Earn", description: "Users earn points for time spent viewing pages with ads.", group: "earning", home: { href: "/admin/monetization?tab=browse-earn", where: "Monetization → Browse & Earn" }, def: true, category: "ads" },
  { key: "ads.rewarded_enabled", label: "Watch ads (rewarded video)", description: "Users earn points for watching a rewarded ad to the end.", group: "earning", home: { href: "/admin/monetization", where: "Monetization" }, def: false, category: "ads" },
  { key: "pwa.install_reward_enabled", label: "App install bonus", description: "One-time points for installing and using the app.", group: "earning", home: { href: "/admin/users/app-installs", where: "Users → App installs" }, def: false, category: "pwa" },
  { key: "referral_bonus_config", jsonField: "enabled", label: "Referral bonuses (master switch)", description: "Signup, plan, purchase, deposit, milestone and monthly referral bonuses. Off = none of them pay.", group: "earning", home: { href: "/admin/referrals?tab=bonuses", where: "Referrals → Bonuses" }, def: false, category: "referral" },
  { key: "social_earning.enabled", label: "Social earning (master switch)", description: "Points for posts, likes, comments, views and shares on the feed.", group: "social", home: { href: "/admin/settings/feed?tab=social-earning", where: "Feed settings → Social earning" }, def: true, category: "social_earning" },
  { key: "affiliate_config", jsonField: "enabled", label: "Affiliate programme", description: "Affiliates earn cash commission on course and marketplace sales from their links.", group: "commerce", home: { href: "/admin/affiliate", where: "Affiliate" }, def: true, category: "affiliate" },
  { key: "marketplace_license_tiers_enabled", label: "Marketplace licence tiers", description: "Sellers can offer Standard / Extended licences at different prices.", group: "commerce", home: { href: "/admin/marketplace/settings", where: "Marketplace → Settings" }, def: false, category: "marketplace" },
  { key: "feed.public_post_sharing", label: "Public post links", description: "A post can be opened by its link without signing in.", group: "social", home: { href: "/admin/settings/feed", where: "Feed settings" }, def: false, category: "feed" },
  { key: "ads.under_post_banner", label: "Banner under posts", description: "An ad banner under a post on its own page.", group: "monetization", home: { href: "/admin/ads", where: "Ads" }, def: true, category: "ads" },
  { key: "ads.auto_ads_enabled", label: "Google Auto ads", description: "Google decides where to put extra ads on free pages.", group: "monetization", home: { href: "/admin/monetization", where: "Monetization" }, def: false, category: "ads", danger: "Google Auto ads can place ads on pages where users are paid for activity, which AdSense can ban the account for. Only turn this on if you are sure." },
  { key: "ads.google_cmp_enabled", label: "Google consent message (CMP)", description: "Google's own cookie-consent message for EU/UK visitors.", group: "monetization", home: { href: "/admin/monetization", where: "Monetization" }, def: false, category: "ads" },
  { key: "payroll.enabled", label: "Staff payroll", description: "Monthly salaries and commission for staff.", group: "platform", home: { href: "/admin/finance/company", where: "Finance → Company" }, def: false, category: "payroll" },
  { key: "notify_referral", label: "Notify on referral activity", description: "Email/push when a referral joins or earns a commission. The in-app record is always kept.", group: "platform", home: { href: "/admin/referrals?tab=limits", where: "Referrals → Limits" }, def: true, category: "notifications" },
  { key: "seo.indexing", label: "Search engines may index the site", description: "Off tells Google and others not to list the site.", group: "platform", home: { href: "/admin/seo", where: "SEO" }, def: true, category: "seo", danger: "Turning indexing off tells Google to drop the whole site from search results." },
];

const EXTRA_BY_KEY = new Map(EXTRA_SWITCHES.map((x) => [x.key, x]));

export interface FeatureSwitch {
  key: string;
  label: string;
  description: string;
  effect: string | null;
  danger: string | null;
  notActive: boolean;
  /** Its own editor elsewhere (still the same row). */
  home: { href: string; where: string } | null;
  group: SwitchGroupId;
  /** null = no row yet: the code default applies. */
  value: boolean | null;
  /** That code default, when known. */
  defaultValue: boolean | null;
}

async function loadRows(keys: string[]): Promise<Map<string, unknown>> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });
  return new Map(rows.map((r) => [r.key, r.value as unknown]));
}

export async function loadFeatureSwitches(): Promise<FeatureSwitch[]> {
  const rows = await loadRows(SETTINGS_CATALOG.map((e) => e.key));
  const out: FeatureSwitch[] = [];
  for (const e of SETTINGS_CATALOG) {
    const stored = rows.get(e.key);
    if (!isSwitchEntry(e, stored)) continue;
    const v = stored === undefined ? null : unwrapSetting(stored);
    out.push({
      key: e.key,
      label: e.label,
      description: e.description,
      effect: e.effect ?? null,
      danger: e.danger ?? null,
      notActive: e.status === "not-active",
      home: e.home ?? null,
      group: switchGroupOf(e.key),
      value: typeof v === "boolean" ? v : null,
      defaultValue: null,
    });
  }
  const extraRows = await loadRows(EXTRA_SWITCHES.map((x) => x.key));
  for (const x of EXTRA_SWITCHES) {
    if (out.some((o) => o.key === x.key)) continue;
    out.push({
      key: x.key,
      label: x.label,
      description: x.description,
      effect: null,
      danger: x.danger ?? null,
      notActive: false,
      home: x.home,
      group: x.group,
      value: readExtra(x, extraRows.get(x.key)),
      defaultValue: x.def,
    });
  }
  return out;
}

function readExtra(x: ExtraSwitch, stored: unknown): boolean | null {
  if (stored === undefined || stored === null) return null;
  const v = unwrapSetting(stored);
  if (x.jsonField) {
    const f = v && typeof v === "object" ? (v as Record<string, unknown>)[x.jsonField] : undefined;
    return typeof f === "boolean" ? f : null;
  }
  return typeof v === "boolean" ? v : null;
}

/** The catalog entry for `key` if it is a switch the Control Center may flip. */
export async function switchEntry(
  key: string
): Promise<{ entry: SettingEntry; stored: unknown; jsonField?: "enabled" } | null> {
  const extra = EXTRA_BY_KEY.get(key);
  if (extra && !SETTINGS_CATALOG.some((e) => e.key === key)) {
    const stored = (await loadRows([key])).get(key);
    return {
      // `group` here is the row category the feature's own editor writes.
      entry: { key, label: extra.label, description: extra.description, group: extra.category } as unknown as SettingEntry,
      stored,
      jsonField: extra.jsonField,
    };
  }
  const entry = SETTINGS_CATALOG.find((e) => e.key === key);
  if (!entry) return null;
  const stored = (await loadRows([key])).get(key);
  return isSwitchEntry(entry, stored) ? { entry, stored } : null;
}
