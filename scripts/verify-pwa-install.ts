import * as fs from "fs";
import * as path from "path";
import {
  detectPwaPlatform,
  normalizePwaRewardConfig,
  parsePwaHost,
  parsePwaPlatform,
  PWA_DISPLAY_MODES,
} from "../src/lib/pwa-shared";
import { validateSettingValues } from "../src/lib/setting-guards";
import { pointSourceOf } from "../src/lib/finance/points-source";
import { deriveSource } from "../src/lib/tx-sources";
import { EVENT_ACTION_TYPES, EVENT_ACTION_META } from "../src/lib/events-shared";

/**
 * PWA install tracking + install reward (src/lib/pwa-install.ts).
 *
 * Static checks on the guards that stop the reward being farmed, plus pure
 * tests of platform detection and the settings bounds. No database.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-pwa-install.ts
 */

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    failed++;
    console.log(`  FAIL ${msg}`);
  }
};
const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

console.log("Reward guards (src/lib/pwa-install.ts)");
const lib = read("src/lib/pwa-install.ts");
const payFn = lib.slice(lib.indexOf("async function payInstallReward"), lib.indexOf("export async function getPwaRewardStatus"));
ok(/updateMany\(\{[\s\S]*?pwaRewardedAt: null[\s\S]*?data: \{ pwaRewardedAt: new Date\(\) \}/.test(payFn), "CAS: updateMany where pwaRewardedAt null -> set");
ok(/won\.count !== 1\) return false/.test(payFn), "CAS loser pays nothing");
ok(/status: UserStatus\.ACTIVE/.test(payFn), "ACTIVE re-checked inside the CAS");
ok(/pwaDays: \{ gte: cfg\.minDays \}/.test(payFn), "min-days re-checked inside the CAS");
ok(payFn.indexOf("updateMany") < payFn.indexOf("creditPoints(tx"), "CAS runs before the credit, in the same tx");
ok(/reference: PWA_REWARD_REFERENCE\(userId\)/.test(payFn) && /`pwa_install_\$\{userId\}`/.test(lib), "unique ledger reference pwa_install_<userId>");
ok(/TransactionType\.EARNING/.test(payFn), "EARNING ledger row");
const tm = /timeout: (\d[\d_]*)/.exec(payFn);
ok(tm && Number(tm[1].replace(/_/g, "")) <= 15_000, "transaction timeout <= 15s (Accelerate)");
ok(/isDuplicateLedgerError/.test(payFn), "a duplicate ledger row is swallowed, not surfaced");
ok(!/\.amount/.test(lib), "never reads Transaction.amount");
const seenFn = lib.slice(lib.indexOf("export async function recordPwaSeen"), lib.indexOf("async function payInstallReward"));
ok(/"pwaLastSeenAt" < \$\{utcToday\(now\)\}/.test(seenFn) && /"pwaDays" = "pwaDays" \+ 1/.test(seenFn), "days move only on a new UTC day, in the update's where");
ok(/if \(!user\) return out;/.test(seenFn) && seenFn.indexOf("if (!user) return out;") < seenFn.indexOf("payInstallReward"), "a same-day repeat returns before any reward path");
ok(/if \(!input\.standalone\) \{[\s\S]*?pwaFirstSeenAt: null[\s\S]*?return out;/.test(seenFn), "appinstalled alone never counts a day");
ok(/isStaffRole\(user\.role/.test(seenFn), "staff excluded");
ok(/user\.pwaDays < cfg\.minDays\) return out;/.test(seenFn), "min-days gate before events and reward");
ok(seenFn.indexOf("cfg.minDays) return out") < seenFn.indexOf("recordUserAction"), "event action only after min-days");

ok(/rewardBlockedReason/.test(read("src/lib/pwa-install.ts")) && /fpHash/.test(read("src/lib/pwa-install.ts")) && /emailVerified/.test(read("src/lib/pwa-install.ts")), "anti-farm: account age, verified email, approved task, one device");

console.log("Beacon route (src/app/api/pwa/seen/route.ts)");
const route = read("src/app/api/pwa/seen/route.ts");
ok(/if \(!allow\(userId\)\)/.test(route), "per-user rate limit (in memory; no DB round trip)");
ok(route.indexOf("allow(userId)") < route.indexOf("recordPwaSeen("), "rate limit before any write");
ok(/if \(!userId\) return NextResponse\.json\(\{ ok: false \}, \{ status: 401 \}\)/.test(route), "needs a session");
const mw = read("middleware.ts");
ok(!/["'`]\/api\/pwa/.test(mw), "/api/pwa is NOT in the middleware public allowlist");

console.log("Settings bounds");
ok(validateSettingValues({ "pwa.install_reward_points": 100001 }).length === 1, "points > 100000 rejected");
ok(validateSettingValues({ "pwa.install_reward_points": -1 }).length === 1, "negative points rejected");
ok(validateSettingValues({ "pwa.install_reward_points": 1.5 }).length === 1, "fractional points rejected");
ok(validateSettingValues({ "pwa.install_reward_points": 500 }).length === 0, "500 points accepted");
ok(validateSettingValues({ "pwa.install_reward_min_days": 0 }).length === 1, "min days 0 rejected");
ok(validateSettingValues({ "pwa.install_reward_min_days": 2 }).length === 0, "min days 2 accepted");
const d = normalizePwaRewardConfig({});
ok(!d.enabled && d.points === 0 && d.minDays === 2, "defaults: off, 0 points, 2 days");
ok(normalizePwaRewardConfig({ minDays: 0 }).minDays >= 1, "stored min days 0 never pays on no evidence");
ok(normalizePwaRewardConfig({ points: 1e9 }).points === 100_000, "stored points clamped");
ok(normalizePwaRewardConfig({ enabled: "yes" }).enabled === false, "only true enables");

console.log("Labelling");
ok(pointSourceOf({ type: "EARNING", reference: "pwa_install_cabc" }) === "app_install", "points-source: App install bonus");
ok(deriveSource("EARNING", "pwa_install_cabc") === "bonus", "tx-sources: bonus, not task");
ok(EVENT_ACTION_TYPES.includes("PWA_INSTALLED") && !!EVENT_ACTION_META.PWA_INSTALLED, "event action PWA_INSTALLED offered");
const gp = read("src/lib/goal-progress.ts");
ok(/PWA_INSTALLED: \["pwa_installed"\]/.test(gp) && /`pwa:\$\{targetId\}`/.test(gp), "goal-progress accepts pwa_installed, deduped per user");

console.log("Platform detection");
const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadOS: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  cros: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};
ok(detectPwaPlatform(UA.android) === "android", "Android UA (contains Linux) -> android");
ok(detectPwaPlatform(UA.iphone) === "ios", "iPhone -> ios");
ok(detectPwaPlatform(UA.ipadOS, { maxTouchPoints: 5 }) === "ios", "iPadOS (Mac UA + touch) -> ios");
ok(detectPwaPlatform(UA.ipadOS, { maxTouchPoints: 0 }) === "desktop", "real Mac -> desktop");
ok(detectPwaPlatform(UA.windows) === "desktop", "Windows -> desktop");
ok(detectPwaPlatform(UA.linux) === "desktop", "Linux desktop -> desktop");
ok(detectPwaPlatform(UA.cros) === "desktop", "ChromeOS -> desktop");
ok(detectPwaPlatform(UA.windows, { uaDataPlatform: "Android" }) === "android", "userAgentData wins over UA");
ok(detectPwaPlatform("") === "other" && detectPwaPlatform("SomeBot/1.0") === "other", "unknown -> other");
ok(parsePwaPlatform("android") === "android" && parsePwaPlatform("<script>") === "other", "server whitelists platform");
ok(parsePwaHost("WWW.RevType.com") === "www.revtype.com" && parsePwaHost("a b") === null, "host sanitised");
ok(!(PWA_DISPLAY_MODES as readonly string[]).includes("browser"), "browser display mode never counts");

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
