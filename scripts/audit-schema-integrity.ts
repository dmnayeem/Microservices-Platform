import "dotenv/config";
import * as io from "fs";

/**
 * Static audit of prisma/schema.prisma:
 *   1. relations with no explicit `onDelete` (Prisma silently picks Restrict for
 *      required relations and SetNull for optional ones — one of those is
 *      usually right and one is usually a surprise);
 *   2. foreign-key columns with no covering index. Postgres does NOT index a
 *      foreign key for you, so every join and every cascade check on an
 *      unindexed FK is a sequential scan.
 *
 * Reads the schema file only — no database, no writes.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/audit-schema-integrity.ts
 */

const SCHEMA = "prisma/schema.prisma";
const src = io.readFileSync(SCHEMA, "utf8");

interface Model {
  name: string;
  body: string;
  line: number;
}

function parseModels(text: string): Model[] {
  const out: Model[] = [];
  const lines = text.split(/\r?\n/);
  let current: { name: string; start: number; buf: string[] } | null = null;
  let depth = 0;
  lines.forEach((ln, i) => {
    const m = /^model\s+(\w+)\s*\{/.exec(ln);
    if (m) {
      current = { name: m[1], start: i + 1, buf: [] };
      depth = 1;
      return;
    }
    if (!current) return;
    if (/^\}/.test(ln)) {
      depth--;
      if (depth === 0) {
        out.push({ name: current.name, body: current.buf.join("\n"), line: current.start });
        current = null;
      }
      return;
    }
    current.buf.push(ln);
  });
  return out;
}

const models = parseModels(src);

console.log(`\n=== Schema integrity — ${models.length} models ===\n`);

/* ── 1. Relations with no explicit onDelete ──────────────────────────────── */

interface RelFinding {
  model: string;
  field: string;
  optional: boolean;
  implied: "Restrict" | "SetNull";
}

const noOnDelete: RelFinding[] = [];

for (const m of models) {
  for (const ln of m.body.split("\n")) {
    if (!/@relation\(/.test(ln) || !/fields:\s*\[/.test(ln)) continue;
    if (/onDelete/.test(ln)) continue;
    const nameMatch = /^\s*(\w+)\s/.exec(ln);
    const optional = /\?\s/.test(ln.replace(/@relation.*/, ""));
    noOnDelete.push({
      model: m.name,
      field: nameMatch ? nameMatch[1] : "?",
      optional,
      implied: optional ? "SetNull" : "Restrict",
    });
  }
}

console.log(`1. Relations with no explicit onDelete: ${noOnDelete.length}\n`);
const restrict = noOnDelete.filter((r) => r.implied === "Restrict");
const setNull = noOnDelete.filter((r) => r.implied === "SetNull");

console.log(`   → Restrict (required relation): ${restrict.length}`);
console.log(`     Deleting the parent FAILS with P2003 while any child exists.`);
console.log(`     For ledger-like tables that is exactly right.`);
for (const r of restrict) console.log(`       ${r.model}.${r.field}`);

console.log(`\n   → SetNull (optional relation): ${setNull.length}`);
console.log(`     Deleting the parent ORPHANS the child with a null pointer.`);
console.log(`     This is the shape that quietly changes what a row means.`);
for (const r of setNull) console.log(`       ${r.model}.${r.field}`);

/* ── 2. Foreign keys with no covering index ──────────────────────────────── */

interface IdxFinding {
  model: string;
  column: string;
}

const unindexed: IdxFinding[] = [];

for (const m of models) {
  // relation scalar columns, e.g. `fields: [userId]` or `fields: [a, b]`
  const fkCols = new Set<string>();
  for (const mm of m.body.matchAll(/@relation\([^)]*fields:\s*\[([^\]]+)\]/g)) {
    for (const c of mm[1].split(",")) fkCols.add(c.trim());
  }
  if (fkCols.size === 0) continue;

  // Anything already covered: @id, @unique on the column, or the FIRST column of
  // an @@index / @@unique (a composite index covers lookups on its prefix).
  const covered = new Set<string>();
  for (const ln of m.body.split("\n")) {
    const decl = /^\s*(\w+)\s+\S+.*@(id|unique)\b/.exec(ln);
    if (decl) covered.add(decl[1]);
  }
  for (const mm of m.body.matchAll(/@@(?:index|unique|id)\(\s*\[([^\]]+)\]/g)) {
    const first = mm[1].split(",")[0].trim();
    covered.add(first);
  }

  for (const c of fkCols) {
    if (!covered.has(c)) unindexed.push({ model: m.name, column: c });
  }
}

console.log(`\n2. Foreign-key columns with no covering index: ${unindexed.length}\n`);
console.log(`   Postgres does not index a foreign key automatically. Without one,`);
console.log(`   joining on it — and every referential check when the parent is`);
console.log(`   deleted or updated — scans the whole child table.\n`);
for (const u of unindexed) console.log(`     ${u.model}.${u.column}`);

/* ── 3. Money columns still on Float ─────────────────────────────────────── */

const MONEY_HINT = /(amount|price|balance|earnings|payout|commission|fee|budget|spent|cost|prize)/i;
const floats: string[] = [];
for (const m of models) {
  for (const ln of m.body.split("\n")) {
    const decl = /^\s*(\w+)\s+Float/.exec(ln);
    if (!decl) continue;
    if (MONEY_HINT.test(decl[1])) floats.push(`${m.name}.${decl[1]}`);
  }
}
console.log(`\n3. Money-ish columns still typed Float: ${floats.length}\n`);
console.log(`   Stored money is Decimal(18,6); these are rates/multipliers, which`);
console.log(`   is defensible — but a percentage on a Float drifts when multiplied.\n`);
for (const f of floats) console.log(`     ${f}`);

console.log("");
