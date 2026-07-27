import "server-only";
import { prisma } from "@/lib/prisma";
import type { WithdrawalTickerItem } from "@/components/user/primitives/withdrawal-ticker";

export interface TickerConfig {
  enabled: boolean;
  show_real: boolean;
  include_fake: boolean;
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
  display_type: "SCROLLING" | "STATIC" | "POPUP";
}

const DEFAULTS: TickerConfig = {
  enabled: true,
  show_real: true,
  include_fake: true,
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
  display_type: "SCROLLING",
};

const KEY_PREFIX = "ticker_";

// Per-instance memo — the ticker renders on every feed load; staleness bounded
// to 30s (mirrors system-settings/economy module caches).
let _cfgCache: { value: TickerConfig; ts: number } | null = null;
const CFG_TTL_MS = 30_000;

async function loadConfig(): Promise<TickerConfig> {
  if (_cfgCache && Date.now() - _cfgCache.ts < CFG_TTL_MS) return _cfgCache.value;
  const merged: TickerConfig = { ...DEFAULTS };
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { category: "ticker" },
      cacheStrategy: { ttl: 30, swr: 60 },
    });
    for (const r of rows) {
      if (!r.key.startsWith(KEY_PREFIX)) continue;
      const k = r.key.slice(KEY_PREFIX.length);
      if (!(k in DEFAULTS)) continue;
      const v = r.value;
      const unwrapped =
        v && typeof v === "object" && "v" in (v as object)
          ? (v as { v: unknown }).v
          : v;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[k] = unwrapped;
    }
  } catch {
    // DB unreachable — return defaults
  }
  _cfgCache = { value: merged, ts: Date.now() };
  return merged;
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
 * Returns `null` when the ticker is disabled in admin config.
 */
export async function getTickerPayload(): Promise<{
  config: TickerConfig;
  items: WithdrawalTickerItem[];
} | null> {
  const cfg = await loadConfig();
  if (!cfg.enabled) return null;

  let realItems: WithdrawalTickerItem[] = [];
  if (cfg.show_real) {
    try {
      // Social-proof ticker — a bit of staleness is fine; cache to spare the DB
      // on every feed render.
      const recent = await prisma.withdrawal.findMany({
        where: {
          status: { in: ["COMPLETED", "PROCESSING"] },
          amount: { gte: cfg.min_amount_to_show },
        },
        orderBy: { createdAt: "desc" },
        take: cfg.max_items,
        cacheStrategy: { ttl: 30, swr: 60 },
      });
      const userIds = [...new Set(recent.map((w) => w.userId))];
      const users = userIds.length
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, country: true },
            cacheStrategy: { ttl: 60, swr: 120 },
          })
        : [];
      const usersById = new Map(users.map((u) => [u.id, u]));
      realItems = recent.map((w) => {
        const u = usersById.get(w.userId);
        return {
          id: w.id,
          username: u?.name ?? "Anonymous",
          amount: Number(w.amount),
          unit: "USD" as const,
          method: w.method,
          country: u?.country ?? undefined,
        };
      });
    } catch {
      // ignore
    }
  }

  // Mix in fake items if enabled — fill up to max_items
  const remaining = Math.max(0, cfg.max_items - realItems.length);
  const fakes = cfg.include_fake && remaining > 0
    ? generateFakeItems(cfg, remaining)
    : [];

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

  // Filter by country (if not WORLDWIDE)
  const allowedCountries = cfg.countries
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const isWorldwide =
    allowedCountries.length === 0 || allowedCountries.includes("WORLDWIDE");
  const filtered = isWorldwide
    ? items
    : items.filter(
        (it) => !it.country || allowedCountries.includes(it.country.toUpperCase())
      );

  return { config: cfg, items: filtered.slice(0, cfg.max_items) };
}
