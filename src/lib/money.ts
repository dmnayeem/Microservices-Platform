import { Prisma } from "@/generated/prisma";

/**
 * Money helpers — exact decimal arithmetic for currency (USD) values.
 *
 * Money columns are stored as Postgres `Decimal(18,6)` and surface from Prisma
 * as `Prisma.Decimal` (Decimal.js). JS `number` (float) drifts under repeated
 * add/sub — a real risk for balances and commission splits — so server-side
 * money math funnels through here.
 *
 * The client/API contract stays `number`: serialize with `toNum()` at every
 * JSON boundary (clients and `src/types` are typed `number`). Prisma accepts
 * `number | string | Decimal` on writes / `increment` / `decrement` and in
 * filter operators, so write sites and the atomic-CAS balance guards need no
 * change — only reads that do JS arithmetic on a Decimal do.
 */
export type Money = Prisma.Decimal;
export const Money = Prisma.Decimal;

export type MoneyInput = Prisma.Decimal | number | string;

/** Construct a Decimal from a number/string/Decimal. */
export function D(x: MoneyInput): Money {
  return new Prisma.Decimal(x);
}

/** Serialize a money value back to a plain `number` for JSON responses. */
export function toNum(x: MoneyInput | null | undefined): number {
  if (x == null) return 0;
  return x instanceof Prisma.Decimal ? x.toNumber() : new Prisma.Decimal(x).toNumber();
}

/** Like `toNum`, but preserves `null`/`undefined` (nullable money columns). */
export function toNumOrNull(x: MoneyInput | null | undefined): number | null {
  return x == null ? null : toNum(x);
}

export const add = (a: MoneyInput, b: MoneyInput): Money => D(a).add(b);
export const sub = (a: MoneyInput, b: MoneyInput): Money => D(a).sub(b);
export const mul = (a: MoneyInput, b: MoneyInput): Money => D(a).mul(b);
export const div = (a: MoneyInput, b: MoneyInput): Money => D(a).div(b);

export const gte = (a: MoneyInput, b: MoneyInput): boolean => D(a).gte(b);
export const gt = (a: MoneyInput, b: MoneyInput): boolean => D(a).gt(b);
export const lte = (a: MoneyInput, b: MoneyInput): boolean => D(a).lte(b);
export const lt = (a: MoneyInput, b: MoneyInput): boolean => D(a).lt(b);
export const eq = (a: MoneyInput, b: MoneyInput): boolean => D(a).eq(b);

/** Sum a list of money values exactly (empty → 0). */
export function sum(xs: MoneyInput[]): Money {
  return xs.reduce<Money>((acc, x) => acc.add(x), new Prisma.Decimal(0));
}

/** Round to 2 dp (currency display / final settlement). */
export const round2 = (x: MoneyInput): Money =>
  D(x).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
