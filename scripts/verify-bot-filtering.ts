import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { isBotUserAgent } from "../src/lib/bot-detect";

/**
 * Bot traffic — kept out of the impression count, and flagged at signup.
 *
 * The owner's question was the right one: 123 users, 16,506 impressions. The
 * answer is that impressions are counted server-side at DELIVERY, which is the
 * correct ruler for an ad server but counts every crawler that loads a page.
 * Against those 16,506 there were 210 deduplicated, user-attributed views from
 * 73 people. Inventory nobody saw is not sellable, and it drags every CTR on
 * the report down with it.
 *
 * Two rules, one definition:
 *   - serving does not count an impression for an automated client;
 *   - a signup from one is recorded as a fraud event rather than blocked.
 *
 * The second is deliberately not a block. This is a string match on a header
 * the client chooses: refusing on it turns one spoofed header into a locked-out
 * real user, while a determined bot sends a browser agent and walks through
 * either way. What it buys is visibility, which is what was asked for.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-bot-filtering.ts
 */

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/** Real user agents, as sent by real browsers. None of these may be a bot. */
const HUMANS = [
  // Chrome, Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  // Safari, iPhone — the platform's biggest audience
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // Chrome, Android
  "Mozilla/5.0 (Linux; Android 14; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  // Firefox, Linux
  "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
  // Edge
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
  // Samsung Internet
  "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  // Opera Mini, common on low-end Android in this platform's markets
  "Opera/9.80 (Android; Opera Mini/70.0.2254/191.303; U; en) Presto/2.12.423 Version/12.16",
];

/** Clients that are not a person reading the page. */
const BOTS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
  "Mozilla/5.0 (compatible; DuckDuckBot-Https/1.1; https://duckduckgo.com/duckduckbot)",
  "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
  "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "WhatsApp/2.23.20.0",
  "TelegramBot (like TwitterBot)",
  "Discordbot/2.0; +https://discordapp.com",
  "curl/8.4.0",
  "Wget/1.21.3",
  "python-requests/2.31.0",
  "axios/1.6.7",
  "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)",
  "Go-http-client/2.0",
  "PostmanRuntime/7.36.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
];

function main() {
  console.log("\n=== Bot filtering ===\n");

  /* ── 1. The test itself ── */
  console.log("1. Real browsers are never called bots");
  {
    // This is the expensive direction to get wrong: a false positive here
    // stops counting impressions the owner can actually sell, silently.
    const wrong = HUMANS.filter((ua) => isBotUserAgent(ua));
    check(
      `all ${HUMANS.length} real browser agents pass through`,
      wrong.length === 0,
      wrong.join(" | ")
    );
  }

  console.log("\n2. Automated clients are caught");
  {
    const missed = BOTS.filter((ua) => !isBotUserAgent(ua));
    check(`all ${BOTS.length} known bot agents are caught`, missed.length === 0, missed.join(" | "));
    check(
      "a request with no user agent at all counts as a bot",
      isBotUserAgent(null) && isBotUserAgent(""),
      "a browser always sends one; a script often does not"
    );
    check("the match is case-insensitive", isBotUserAgent("CURL/8.4.0"));
  }

  /* ── 3. Where it is applied ── */
  console.log("\n3. Serving does not count an impression for a bot");
  {
    const serve = read("src/lib/ad-serve.ts");
    // Both rulers, or the feed and every other space measure different
    // audiences again — which is a bug this file has already had once.
    const guards = (serve.match(/!\(await isBotRequest\(\)\)/g) ?? []).length;
    check(
      "both serve paths check before counting",
      guards === 2,
      `${guards} of 2 — single-ad and in-feed`
    );
    check(
      "the impression is what is skipped, not the ad",
      /bufferServeOutcome|recordServeOutcome/.test(serve),
      "the ad was genuinely delivered; it is the audience number that must stay honest"
    );

    const lib = read("src/lib/bot-detect.ts");
    check(
      "no request context means not a bot",
      /catch \{\s*return false;/.test(lib),
      "a script or build render has no user agent and must not stop counting"
    );
  }

  /* ── 4. Signup ── */
  console.log("\n4. An automated signup is recorded, not blocked");
  {
    const reg = read("src/app/api/auth/register/route.ts");
    check("signup runs the same test", /isBotUserAgent\(signupUa\)/.test(reg));
    check(
      "it records a fraud event an admin can see",
      /eventType: "BOT_SIGNUP"/.test(reg) && /recordFraudEvent\(/.test(reg)
    );
    check(
      "the reason distinguishes a bot agent from a missing one",
      /no user agent sent/.test(reg),
      "those are different signals and an admin reading the row needs to know which"
    );
    // The important negative. A string match on a client-chosen header must
    // never be the thing that refuses a real person an account.
    // Scoped to the bot branch itself. The per-IP cap that follows it DOES
    // refuse, with a 429, and that is a different control on a different
    // signal — slicing as far as registerUser would read its return as this
    // one's.
    const botBranch = reg.slice(
      reg.indexOf("if (isBotUserAgent(signupUa))"),
      reg.indexOf("if (fraud.maxUsersPerIp")
    );
    check(
      "…and it does not refuse the signup",
      botBranch.length > 0 && !/\breturn\b/.test(botBranch),
      "one spoofed header would lock out a real user while a real bot walks through"
    );
    // The per-IP cap is a different control and must survive this change.
    check(
      "the per-IP account cap is untouched",
      /maxUsersPerIp/.test(reg) && /MULTIPLE_ACCOUNTS/.test(reg)
    );
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main();
