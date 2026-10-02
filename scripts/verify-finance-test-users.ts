/**
 * verify-finance-test-users — finance test users are left out of every finance
 * figure, and the merge that does it never drops a filter already present.
 *
 * Run:  npx tsx --tsconfig tsconfig.script.json scripts/verify-finance-test-users.ts
 *
 * Static + pure. No database reads or writes.
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeTestUserIds, testUsersSql, withoutUsers } from "../src/lib/finance/test-users-core";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ── 1. Every finance query file uses the exclusion ─────────────────────── */

const FILES: Array<{ file: string; min: number }> = [
  { file: "src/lib/finance/scope.ts", min: 8 },
  { file: "src/lib/finance/series.ts", min: 1 },
  { file: "src/lib/finance/revenue.ts", min: 8 },
  { file: "src/lib/finance/by-feature.ts", min: 6 },
  { file: "src/lib/finance/pulse.ts", min: 8 },
  { file: "src/lib/finance/points-breakdown.ts", min: 1 },
  { file: "src/lib/progress-report.ts", min: 10 },
  { file: "src/app/api/admin/finance/ledger/route.ts", min: 1 },
  { file: "src/app/admin/finance/page.tsx", min: 1 },
  { file: "src/app/admin/page.tsx", min: 11 },
];
const USE = /\b(withoutUsers|excludeTestUsers|noTest|x)(<[^<>()]*>)?\(|\$\{notTestU\}|excludeAdvertiserIds/g;
for (const { file, min } of FILES) {
  const src = read(file);
  check(`${file} imports the test-user helper`, src.includes(`@/lib/finance/test-users`));
  const uses = (src.match(USE) ?? []).length;
  check(`${file} applies the exclusion ≥${min}×`, uses >= min, `found ${uses}`);
}

// The ad revenue line goes through adRevenueWindow, which must honour the list.
check(
  "adRevenueWindow skips excluded advertisers",
  /skipAdvertiser\.has\(advertiserId\)/.test(read("src/lib/ad-revenue.ts")) &&
    read("src/lib/finance/revenue.ts").includes("excludeAdvertiserIds: testIds")
);

// Every prisma call in the finance libs must carry the exclusion: a crude but
// useful tripwire — count prisma.<model>.<op>( calls vs exclusion uses.
for (const file of ["src/lib/finance/scope.ts", "src/lib/finance/revenue.ts", "src/lib/finance/pulse.ts"]) {
  const src = read(file);
  const calls = (src.match(/prisma\.\w+\.(aggregate|findMany|count|groupBy)\(/g) ?? []).length;
  const uses = (src.match(USE) ?? []).length;
  check(`${file}: no un-excluded query (${calls} queries)`, uses >= calls, `${uses} uses`);
}

// The operational queue keeps test users and badges them.
const wq = read("src/app/admin/withdrawals/page.tsx");
check("withdrawal queue badges test users", wq.includes("testUserIds.has(") && wq.includes("Test user"));
check("withdrawal queue list is NOT filtered", !/withoutUsers|excludeTestUsers/.test(wq));

// Write route is guarded and audited.
const route = read("src/app/api/admin/finance/test-users/route.ts");
check("test-users POST needs finance.settings", /financeGuard\("finance\.settings"\)/.test(route));
check("test-users GET needs finance.view", /financeGuard\("finance\.view"\)/.test(route));
check("test-users writes audit with targetUserId", (route.match(/targetUserId: userId/g) ?? []).length === 2);
check("test-users search is limited to 20", route.includes("take: 20"));

/* ── 2. Pure merge ──────────────────────────────────────────────────────── */

const ids = ["u1", "u2"];
check("empty list is a no-op", eq(withoutUsers({ status: "PENDING" }, []), { status: "PENDING" }));
check("undefined where", eq(withoutUsers(undefined, ids), { userId: { notIn: ids } }));
check(
  "free field is set directly",
  eq(withoutUsers({ status: "X" }, ids), { status: "X", userId: { notIn: ids } })
);
check(
  "existing filter on the field is kept (goes to AND)",
  eq(withoutUsers({ id: { in: ["a"] } }, ids, "id"), { id: { in: ["a"] }, AND: [{ id: { notIn: ids } }] })
);
check(
  "existing AND object is preserved",
  eq(withoutUsers({ AND: { a: 1 }, userId: "z" }, ids), {
    AND: [{ a: 1 }, { userId: { notIn: ids } }],
    userId: "z",
  })
);
check(
  "existing AND array is extended",
  eq(withoutUsers({ AND: [{ a: 1 }] }, ids), { AND: [{ a: 1 }], userId: { notIn: ids } })
);
check(
  "several fields",
  eq(withoutUsers({}, ids, ["buyerId", "sellerId"]), { buyerId: { notIn: ids }, sellerId: { notIn: ids } })
);
check(
  "relation path goes through AND",
  eq(withoutUsers({}, ids, "listing.sellerId"), { AND: [{ listing: { sellerId: { notIn: ids } } }] })
);
check(
  "nullable keeps NULL rows",
  eq(withoutUsers({ isHouse: false }, ids, "advertiserId", { nullable: true }), {
    isHouse: false,
    AND: [{ OR: [{ advertiserId: null }, { advertiserId: { notIn: ids } }] }],
  })
);
check("input object is not mutated", (() => {
  const w = { id: { in: ["a"] } };
  withoutUsers(w, ids, "id");
  return eq(w, { id: { in: ["a"] } });
})());
check(
  "normalize: strings only, unique, trimmed",
  eq(normalizeTestUserIds([" a ", "a", 3, null, "b", ""]), ["a", "b"])
);
check("normalize: non-array → []", eq(normalizeTestUserIds({}), []));
check("normalize: capped at 500", normalizeTestUserIds(Array.from({ length: 900 }, (_, i) => `id${i}`)).length === 500);
check("sql: empty list → empty fragment", testUsersSql([]).sql === "");
check("sql: fragment binds the list", (() => {
  const s = testUsersSql(ids, "u.id");
  return s.sql.includes("u.id <> ALL(") && eq(s.values, [ids]);
})());

/* ── report ─────────────────────────────────────────────────────────────── */
console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
