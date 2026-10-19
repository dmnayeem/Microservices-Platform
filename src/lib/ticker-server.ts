import "server-only";
import { prisma } from "@/lib/prisma";
import { NON_STAFF_WHERE } from "@/lib/staff";
import type { WithdrawalTickerItem } from "@/components/user/primitives/withdrawal-ticker";

/**
 * What the ticker shows.
 *  - REAL:      only withdrawals that were actually paid out
 *  - GENERATED: only entries made up from the admin's generator settings
 *  - BOTH:      real ones first, the remaining slots filled with generated ones
 */
export type TickerSource = "REAL" | "GENERATED" | "BOTH";
export const TICKER_SOURCES: TickerSource[] = ["REAL", "GENERATED", "BOTH"];

export interface TickerConfig {
  enabled: boolean;
  source: TickerSource;
  fake_username_pattern: string;
  fake_min_amount: number;
  fake_max_amount: number;
  fake_methods: string;
  max_items: number;
  min_amount_to_show: number;
  countries: string;
  show_amount: boolean;
  show_method: boolean;
  show_country: boolean;
  scroll_speed_ms: number;
}

export const TICKER_DEFAULTS: TickerConfig = {
  enabled: true,
  source: "BOTH",
  fake_username_pattern: "User###,Anon###,Crypto###",
  fake_min_amount: 5,
  fake_max_amount: 250,
  fake_methods: "BKASH,NAGAD,PAYPAL,BINANCE",
  max_items: 10,
  min_amount_to_show: 5,
  countries: "WORLDWIDE",
  show_amount: true,
  show_method: false,
  show_country: false,
  scroll_speed_ms: 30000,
};

export const TICKER_KEY_PREFIX = "ticker_";

// Per-instance memo — the ticker renders on every feed load. No Accelerate
// cacheStrategy on top of it: stacked, the two kept an admin's change off the
// feed for up to 90s, so a save looked like it had done nothing.
let _cfgCache: { value: TickerConfig; ts: number } | null = null;
const CFG_TTL_MS = 30_000;

export function clearTickerConfigCache() {
  _cfgCache = null;
}

function unwrap(v: unknown): unknown {
  return v && typeof v === "object" && "v" in (v as object) ? (v as { v: unknown }).v : v;
}

export async function getTickerConfig(): Promise<TickerConfig> {
  if (_cfgCache && Date.now() - _cfgCache.ts < CFG_TTL_MS) return _cfgCache.value;
  const merged: TickerConfig = { ...TICKER_DEFAULTS };
  try {
    const rows = await prisma.systemSetting.findMany({ where: { category: "ticker" } });
    const raw: Record<string, unknown> = {};
    for (const r of rows) {
      if (r.key.startsWith(TICKER_KEY_PREFIX)) raw[r.key.slice(TICKER_KEY_PREFIX.length)] = unwrap(r.value);
    }
    for (const k of Object.keys(TICKER_DEFAULTS) as (keyof TickerConfig)[]) {
      if (k in raw && typeof raw[k] === typeof TICKER_DEFAULTS[k]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (merged as any)[k] = raw[k];
      }
    }
    if (!TICKER_SOURCES.includes(merged.source)) merged.source = TICKER_DEFAULTS.source;
    // Saved before `source` existed: two separate checkboxes said the same thing.
    if (!("source" in raw) && ("show_real" in raw || "include_fake" in raw)) {
      const real = raw.show_real !== false;
      const fake = raw.include_fake !== false;
      merged.source = real && fake ? "BOTH" : fake ? "GENERATED" : "REAL";
    }
  } catch {
    // DB unreachable — return defaults
  }
  _cfgCache = { value: merged, ts: Date.now() };
  return merged;
}

function allowedCountries(cfg: TickerConfig): string[] | null {
  const list = cfg.countries
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.length === 0 || list.includes("WORLDWIDE") ? null : list;
}

// The Accelerate extension's types drop the `select` shape once `cacheStrategy`
// is set, so the row is described here.
interface TickerRow {
  id: string;
  amount: unknown;
  method: string;
  user: { name: string | null; username: string | null; country: string | null } | null;
}

/**
 * Withdrawals that were actually paid, newest first. Staff accounts are left
 * out — their balances were seeded, so a staff payout is not a real one — and
 * the amount/country filters are applied in the query, not after it, so a
 * filter can never empty a list that had matches further back.
 */
export async function getRealTickerItems(cfg: TickerConfig): Promise<WithdrawalTickerItem[]> {
  const countries = allowedCountries(cfg);
  try {
    const rows = (await prisma.withdrawal.findMany({
      where: {
        status: "COMPLETED",
        amount: { gte: cfg.min_amount_to_show },
        user: { ...NON_STAFF_WHERE, ...(countries ? { country: { in: countries } } : {}) },
      },
      orderBy: { updatedAt: "desc" },
      take: cfg.max_items,
      select: {
        id: true,
        amount: true,
        method: true,
        user: { select: { name: true, username: true, country: true } },
      },
      // Social-proof ticker — a bit of staleness is fine; shared by every viewer.
      cacheStrategy: { ttl: 20, swr: 60 },
    })) as unknown as TickerRow[];
    return rows.map((w) => ({
      id: w.id,
      username: w.user?.username ?? w.user?.name ?? "Someone",
      amount: Number(w.amount),
      unit: "USD" as const,
      method: w.method,
      country: w.user?.country ?? undefined,
    }));
  } catch {
    return [];
  }
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateFakeUsername(patterns: string[]): string {
  const pattern = rand(patterns) || "User###";
  return pattern.replace(/#+/g, (match) => {
    let out = "";
    for (let i = 0; i < match.length; i++) {
      out += String(Math.floor(Math.random() * 10));
    }
    return out;
  });
}

function generateFakeItems(cfg: TickerConfig, count: number): WithdrawalTickerItem[] {
  const patterns = cfg.fake_username_pattern
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const methods = cfg.fake_methods
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const min = cfg.fake_min_amount;
  const max = Math.max(min + 1, cfg.fake_max_amount);
  const items: WithdrawalTickerItem[] = [];
  for (let i = 0; i < count; i++) {
    const amount = Math.round((Math.random() * (max - min) + min) * 100) / 100;
    items.push({
      id: `fake-${Date.now()}-${i}`,
      username: generateFakeUsername(patterns),
      amount,
      unit: "USD",
      method: methods.length ? rand(methods) : undefined,
    });
  }
  return items;
}

/**
 * Builds the ticker payload for the user-facing feed.
 * Returns `null` when the ticker is switched off in admin.
 */
export async function getTickerPayload(): Promise<{
  config: TickerConfig;
  items: WithdrawalTickerItem[];
} | null> {
  const cfg = await getTickerConfig();
  if (!cfg.enabled) return null;

  const realItems = cfg.source === "GENERATED" ? [] : await getRealTickerItems(cfg);

  // GENERATED fills every slot; BOTH only the slots real payouts left empty.
  const remaining = Math.max(0, cfg.max_items - realItems.length);
  const fakes = cfg.source !== "REAL" && remaining > 0 ? generateFakeItems(cfg, remaining) : [];

  // Interleave so the feed doesn't have a "all real then all fake" look
  const items: WithdrawalTickerItem[] = [];
  const total = realItems.length + fakes.length;
  let r = 0;
  let f = 0;
  for (let i = 0; i < total; i++) {
    if (r < realItems.length && (f >= fakes.length || i % 2 === 0)) {
      items.push(realItems[r++]);
    } else if (f < fakes.length) {
      items.push(fakes[f++]);
    }
  }

  return { config: cfg, items: items.slice(0, cfg.max_items) };
}
