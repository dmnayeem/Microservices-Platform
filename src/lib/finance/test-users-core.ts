import { Prisma } from "@/generated/prisma/client";

/**
 * The pure half of finance test users (no database): the list's shape, the
 * Prisma `where` merge and the raw-SQL fragment. Split out so it can be tested
 * without a client. Callers import from `./test-users`.
 */

export const TEST_USERS_SETTING_KEY = "finance.test_user_ids";
/** Bounded so a `NOT IN` list can never grow into a payload problem. */
export const MAX_TEST_USERS = 500;

/** Clean whatever is stored: strings only, unique, capped. */
export function normalizeTestUserIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id || id.length > 64 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_TEST_USERS) break;
  }
  return out;
}

type Where = Record<string, unknown>;

export interface ExcludeOpts {
  /**
   * The column can be NULL (e.g. `AdCampaign.advertiserId`). SQL `NOT IN`
   * drops NULL rows, which would silently remove house campaigns too, so a
   * nullable column keeps its NULLs explicitly.
   */
  nullable?: boolean;
}

/** `{ a: { b: leaf } }` from "a.b" — for a column reached through a relation. */
function nest(path: string, leaf: unknown): Where {
  const parts = path.split(".");
  let node: unknown = leaf;
  for (let i = parts.length - 1; i >= 0; i--) node = { [parts[i]]: node };
  return node as Where;
}

function condition(field: string, ids: string[], opts: ExcludeOpts): Where {
  const parts = field.split(".");
  const col = parts.pop()!;
  const leaf: Where = opts.nullable
    ? { OR: [{ [col]: null }, { [col]: { notIn: ids } }] }
    : { [col]: { notIn: ids } };
  return parts.length ? nest(parts.join("."), leaf) : leaf;
}

/**
 * Pure: `where` with every row belonging to `ids` (on each of `fields`)
 * removed. Never overwrites a filter already on the field — a second
 * condition on an existing key goes into `AND`, so `{ id: { in: [...] } }`
 * keeps its `in` and gains the `notIn`.
 *
 * `fields` may name a column through a relation with a dot
 * (`"listing.sellerId"`).
 */
export function withoutUsers<W extends object>(
  // NoInfer: W comes from where the result is used (a Prisma `where`), so an
  // inline literal like `{ status: "PENDING" }` is checked against the model's
  // enum instead of widening to `string`.
  where: NoInfer<W> | undefined,
  ids: readonly string[],
  fields: string | string[] = "userId",
  opts: ExcludeOpts = {}
): W {
  const base = { ...((where ?? {}) as Where) };
  if (ids.length === 0) return base as W;
  const list = [...ids];
  const extra: Where[] = [];
  for (const field of Array.isArray(fields) ? fields : [fields]) {
    const cond = condition(field, list, opts);
    const [key] = Object.keys(cond);
    if (!field.includes(".") && !opts.nullable && !(key in base)) {
      Object.assign(base, cond);
    } else {
      extra.push(cond);
    }
  }
  if (extra.length) {
    const prior = base.AND;
    base.AND = [...(Array.isArray(prior) ? prior : prior ? [prior] : []), ...extra];
  }
  return base as W;
}

/**
 * For `$queryRaw`: `AND <column> <> ALL(ids)`, or nothing when the list is
 * empty. `column` is a trusted, code-written SQL identifier such as
 * `u.id` or `a."userId"` — never user input.
 */
export function testUsersSql(ids: readonly string[], column = `"userId"`): Prisma.Sql {
  if (ids.length === 0) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.raw(column)} <> ALL(${[...ids]}::text[])`;
}
