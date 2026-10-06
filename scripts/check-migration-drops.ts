import fs from "fs";
import path from "path";

/**
 * Raw-SQL index guard.
 *
 * These indexes exist only as raw SQL in a migration (partial / trigram /
 * expression indexes Prisma cannot declare). `prisma migrate dev` / `migrate
 * diff` does not know about them and will happily emit a `DROP INDEX` for them
 * in the next generated migration. Each one backs a real guarantee (no double
 * payout, no duplicate dispute, fast search), so dropping one is a bug.
 *
 * Fails (exit 1) if any prisma/migrations/<dir>/migration.sql drops one of them —
 * case-insensitive, quoted or not, schema-qualified or not, IF EXISTS /
 * CONCURRENTLY or not. SQL comments are ignored.
 *
 *   npm run check:migration-drops
 *
 * Adding a new raw-SQL index? Add its name here AND to MIGRATIONS.md.
 */
export const PROTECTED_INDEXES = [
  "TaskSubmission_one_open_per_user_task", // 20260928200000_audit_indexes — one open submission per user+task
  "User_name_trgm_idx", // 20260820120000_hot_path_indexes — admin user search
  "User_username_trgm_idx", // 20260820120000_hot_path_indexes — admin user search
  "User_blueBadgeExpiresAt_idx", // 20261005100000_plans_and_paid_badges — partial
  "TaskSubmission_buyerReport_status_idx", // 20261006400200_perf_indexes — expression
  "MarketplaceDispute_one_open_per_purchase", // 20261006400300_unique_guards — partial unique
  "CreatorApplication_one_pending_per_user_type", // 20261006400300_unique_guards — partial unique
  "TutorApplication_one_pending_per_user", // 20261006400300_unique_guards — partial unique
  "ArticleTaskKey_fresh_idx", // 20261006800100_article_key_pool — partial; key claims depend on it
];

const protectedSet = new Set(PROTECTED_INDEXES.map((n) => n.toLowerCase()));
const dir = path.resolve(process.cwd(), "prisma", "migrations"); // run from the repo root (npm script)

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** `"public"."Foo"` / public.foo / "Foo" -> foo */
function bareName(raw: string): string {
  const parts = raw.trim().split(".");
  return parts[parts.length - 1].trim().replace(/^"|"$/g, "").toLowerCase();
}

const problems: string[] = [];
let scanned = 0;
for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(dir, entry.name, "migration.sql");
  if (!fs.existsSync(file)) continue;
  scanned++;
  const sql = stripComments(fs.readFileSync(file, "utf8"));
  const re = /\bDROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?([^;]+)/gi;
  for (const m of sql.matchAll(re)) {
    const names = m[1].replace(/\b(CASCADE|RESTRICT)\b/gi, "").split(",");
    for (const n of names) {
      const name = bareName(n);
      if (protectedSet.has(name)) problems.push(`${entry.name}/migration.sql drops "${n.trim()}"`);
    }
  }
}

if (problems.length) {
  console.error("FAIL: a migration drops a raw-SQL index that Prisma cannot recreate:");
  for (const p of problems) console.error("  - " + p);
  console.error("Remove the DROP INDEX from that migration (see MIGRATIONS.md, 'Raw-SQL indexes').");
  process.exit(1);
}
console.log(`OK: ${scanned} migrations scanned, none drop the ${PROTECTED_INDEXES.length} protected raw-SQL indexes.`);
