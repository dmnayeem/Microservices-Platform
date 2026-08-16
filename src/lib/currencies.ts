import { getSetting } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";

/**
 * Admin-configurable local currencies + their USD exchange rate, used to show
 * the deposit amount in the user's own currency (e.g. $1 = ৳125). Stored as one
 * SystemSetting array (`currency_rates`, category `financial`). Each currency
 * lists the ISO2 country codes it applies to; a user's saved `country` selects
 * which currency they see. Display-only — the wallet stays USD-denominated.
 */
export interface Currency {
  /** ISO 4217-ish code, e.g. "BDT". */
  code: string;
  /** Symbol shown to users, e.g. "৳". */
  symbol: string;
  /** How many units of this currency equal 1 USD (e.g. 125). */
  usdRate: number;
  /** ISO2 country codes that use this currency, e.g. ["BD"]. */
  countries: string[];
}

const SETTING_KEY = "currency_rates";

export const CURRENCY_PRESETS: Currency[] = [
  { code: "BDT", symbol: "৳", usdRate: 125, countries: ["BD"] },
  { code: "INR", symbol: "₹", usdRate: 88, countries: ["IN"] },
  { code: "PKR", symbol: "₨", usdRate: 278, countries: ["PK"] },
  { code: "NGN", symbol: "₦", usdRate: 1550, countries: ["NG"] },
];

const num = (v: unknown, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

function normalize(raw: unknown): Currency[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c === "object")
    .map((c) => {
      const o = c as Record<string, unknown>;
      const countries = Array.isArray(o.countries)
        ? o.countries.map((x) => String(x).trim().toUpperCase()).filter(Boolean)
        : typeof o.countries === "string"
          ? String(o.countries)
              .split(/[,\s]+/)
              .map((x) => x.trim().toUpperCase())
              .filter(Boolean)
          : [];
      return {
        code: String(o.code ?? "").trim().toUpperCase().slice(0, 6),
        symbol: String(o.symbol ?? "").trim().slice(0, 4),
        usdRate: num(o.usdRate, 1),
        countries,
      };
    })
    .filter((c) => c.code && c.symbol);
}

/** All configured currencies (presets when nothing saved yet). */
export async function getCurrencies(): Promise<Currency[]> {
  const raw = await getSetting<unknown>(SETTING_KEY, null);
  if (raw == null) return CURRENCY_PRESETS;
  return normalize(raw);
}

/** The currency to show a user based on their ISO2 country (null → USD only). */
export async function getCurrencyForCountry(
  country?: string | null
): Promise<Currency | null> {
  if (!country) return null;
  const iso = country.trim().toUpperCase();
  const list = await getCurrencies();
  return list.find((c) => c.countries.includes(iso)) ?? null;
}

/** Persist the whole currencies array (admin-only at the call site). */
export async function saveCurrencies(list: Currency[]): Promise<void> {
  const clean = normalize(list);
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, category: "financial", value: clean as unknown as object },
    update: { category: "financial", value: clean as unknown as object },
  });
}
