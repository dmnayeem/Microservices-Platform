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
    });
  }
  return out;
}

/** The catalog entry for `key` if it is a switch the Control Center may flip. */
export async function switchEntry(
  key: string
): Promise<{ entry: SettingEntry; stored: unknown } | null> {
  const entry = SETTINGS_CATALOG.find((e) => e.key === key);
  if (!entry) return null;
  const stored = (await loadRows([key])).get(key);
  return isSwitchEntry(entry, stored) ? { entry, stored } : null;
}
