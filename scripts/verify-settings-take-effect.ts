/**
 * Checks that saving an admin setting actually changes what the platform reads.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-settings-take-effect.ts
 *
 * This guards one specific, repeatedly-made mistake. `getSetting` reads through
 * an Accelerate `cacheStrategy`, and that edge cache is not ours to clear — so
 * a writer that only calls `invalidateSettingsCache()` leaves the next read
 * returning the OLD value, or on a key's very first write the cached ABSENCE of
 * the row, which reads as the fallback. Either way the admin saves, reloads,
 * sees nothing change, and concludes the control is dead. That is how a
 * platform ends up with dozens of settings boxes that do nothing.
 *
 * Two things are asserted:
 *  1. statically, that every writer of a `getSetting`-backed key primes the
 *     cache, and does it AFTER clearing (priming first is wiped by the clear);
 *  2. live, that a real commission change is visible to the very next read.
 *
 * Every setting it touches is restored.
 */
import { readFileSync } from "fs";
import { prisma } from "./_q";
import {
  getCommissionConfig,
  saveCommissionConfig,
  FEE_PERCENT_KEY,
} from "../src/lib/marketplace-commission";
import { getSetting } from "../src/lib/system-settings";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Files that both WRITE a SystemSetting row and whose key is read back through
 * the cached `getSetting`. These are the ones where forgetting to prime is a
 * user-visible bug. Writers whose readers use a plain `findUnique` (promotion
 * pricing, mediation fee) are not listed: they have no cache to go stale.
 */
const CACHED_SETTING_WRITERS = [
  "src/lib/marketplace-selling.ts",
  "src/lib/marketplace-commission.ts",
  "src/lib/permissions.ts",
  "src/lib/payroll/config.ts",
  "src/app/api/admin/settings/route.ts",
];

async function main() {
  console.log("Every cached-setting writer primes, and in the right order");
  for (const f of CACHED_SETTING_WRITERS) {
    let src = "";
    try {
      src = readFileSync(f, "utf8");
    } catch {
      check(`${f} exists`, false, "file not found — was it moved?");
      continue;
    }
    const name = f.split("/").slice(-2).join("/");
    const primes = src.includes("primeSetting");
    check(`${name} primes the cache`, primes, primes ? "" : "SAVES WILL READ STALE");
    if (!primes) continue;

    // Priming before the clear is worse than not priming at all: it looks
    // right in review and is wiped a line later.
    const firstClear = src.indexOf("invalidateSettingsCache()");
    const firstPrime = src.indexOf("primeSetting(");
    check(
      `${name} clears before it primes`,
      firstClear >= 0 && firstClear < firstPrime,
      firstClear < 0 ? "no clear at all" : `clear@${firstClear} prime@${firstPrime}`
    );
  }

  console.log("\nA real change is visible to the very next read");
  const original = await getCommissionConfig();
  const startDefault = original.default;
  // Something the current config is definitely not.
  const probe = startDefault === 1234 ? 4321 : 1234;

  await saveCommissionConfig({ default: probe, byAssetType: original.byAssetType });
  const afterSave = await getCommissionConfig();
  check(
    "commission rate reads back immediately",
    afterSave.default === probe,
    `wanted ${probe}, got ${afterSave.default}`
  );

  // The shared percent key is the same setting under another name; both are
  // primed, so both must agree straight away.
  // Imported, not retyped: the key is "marketplace.fee_percent" with a dot,
  // and a hardcoded guess here would fail against perfectly good code.
  const pct = await getSetting<number>(FEE_PERCENT_KEY, -1);
  check(
    "the percent key agrees with it",
    Math.abs(Number(pct) - probe / 100) < 0.001,
    `percent=${pct} bps=${probe}`
  );

  await saveCommissionConfig({
    default: startDefault,
    byAssetType: original.byAssetType,
  });
  const restored = await getCommissionConfig();
  check(
    "restored to the real rate",
    restored.default === startDefault,
    `${restored.default} bps`
  );

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
