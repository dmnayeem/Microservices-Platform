import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import {
  proofUrlRule,
  destinationFieldFor,
  isPinterestPinUrl,
} from "../src/lib/social-proof-url";
import { toPageContent, matchesUrl } from "../src/lib/link-verify";
import { SOCIAL_PLATFORMS } from "../src/lib/social-tasks";

/**
 * Social proof URLs — is the link the right kind of link, and does it point
 * where the campaign paid for?
 *
 * The hole: the only thing ever asked of a proof URL was that the string was
 * not empty. A Pinterest "Create Pin" task could therefore be completed by
 * pasting the admin's own destination link — the one printed in the task
 * instructions — straight back into the proof box, and it was approved. The
 * user never had to make a pin at all.
 *
 * Two separate gates, and they fail differently on purpose:
 *
 *   SHAPE       decided offline, at submit. A profile link is not a pin. This
 *               one is allowed to reject outright, because it needs no network
 *               and cannot be wrong about what it saw.
 *   DESTINATION decided from the fetched pin. Measured against two real pins:
 *               Pinterest publishes the destination in a `<meta content>` and
 *               both the crawler and browser user-agents get it. But a fetch
 *               can still fail, so this one degrades to manual review and
 *               never to a rejection.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-social-proof-url.ts
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

function main() {
  console.log("\n=== Social proof URLs ===\n");

  /* ── 1. Only a pin counts as a pin ── */
  console.log("1. A Create Pin task accepts nothing but a pin link");
  {
    const rule = proofUrlRule("PINTEREST", "CREATE_PIN");
    check("the rule exists", !!rule);

    const accept = [
      "https://www.pinterest.com/pin/1234567890123/",
      "https://pinterest.com/pin/my-slug--1234567890123",
      // Country domains are the same site; rejecting them would fail honest
      // users outside the US, which is most of them.
      "https://in.pinterest.com/pin/999/",
      "https://www.pinterest.co.uk/pin/999/",
      // What the Pinterest app's own share button produces.
      "https://pin.it/aBcD123",
    ];
    const reject = [
      "https://www.pinterest.com/someuser/",
      "https://www.pinterest.com/someuser/my-board/",
      // The exact abuse reported: the campaign's own destination pasted back.
      "https://shop.example.com/product/1",
      // Pinterest-looking path on a host that is not Pinterest.
      "https://example.com/pin/123",
      "javascript:alert(1)",
      "not a url",
      "",
    ];
    for (const u of accept) check(`accepts ${u}`, rule!.test(u));
    for (const u of reject) check(`rejects ${u || "(empty)"}`, !rule!.test(u));
  }

  /* ── 2. The rule is narrow on purpose ── */
  console.log("\n2. Actions we have not checked keep working as before");
  {
    // Inventing a shape for a platform whose URLs nobody measured would start
    // rejecting honest submissions, which is worse than the hole being closed.
    check(
      "a Pinterest follow has no URL shape forced on it",
      proofUrlRule("PINTEREST", "FOLLOW_PROFILE") === null
    );
    check(
      "other platforms are untouched",
      proofUrlRule("FACEBOOK", "CREATE_POST") === null &&
        proofUrlRule("LINKEDIN", "FOLLOW_PROFILE") === null
    );
    check("an unknown platform is untouched", proofUrlRule("NOPE", "NOPE") === null);
    check("a missing platform or action is untouched", proofUrlRule(null, null) === null);

    // Board proof must NOT be forced to be a pin — that action's proof field
    // is literally labelled "Board URL".
    const board = proofUrlRule("PINTEREST", "CREATE_BOARD");
    check(
      "a board task accepts a board and refuses a pin",
      !!board &&
        board.test("https://www.pinterest.com/someuser/my-board/") &&
        !board.test("https://www.pinterest.com/pin/123/")
    );
  }

  /* ── 3. The rule matches what the action actually asks for ── */
  console.log("\n3. The rules line up with the action definitions");
  {
    // If someone renames the field or moves the proof around, the destination
    // check silently stops running. Assert against the real catalog.
    const pinterest = SOCIAL_PLATFORMS.find((p) => p.key === "PINTEREST");
    check("the Pinterest platform still exists", !!pinterest);
    const createPin = pinterest?.actions.find((a) => a.key === "CREATE_PIN");
    check("CREATE_PIN still exists", !!createPin);

    const field = destinationFieldFor("PINTEREST", "CREATE_PIN");
    check("a destination field is named for it", field === "destinationUrl");
    check(
      "…and that field is really on the action",
      !!createPin?.adminFields.some((f) => f.key === field),
      createPin?.adminFields.map((f) => f.key).join(", ")
    );
    check(
      "CREATE_PIN still takes a URL as proof",
      !!createPin?.proofFields?.some((f) => f.type === "url")
    );
    // No destination requirement where there is no destination to match.
    check(
      "no destination is demanded of a follow",
      destinationFieldFor("PINTEREST", "FOLLOW_PROFILE") === null
    );
  }

  /* ── 4. The destination is read from the pin ── */
  console.log("\n4. A pin's destination is found and compared");
  {
    // Shaped like the real thing. Measured on two live pins: the destination
    // arrives in a `<meta content>` and nowhere else — not og:url, which is
    // the pin itself — and the surrounding page is all Pinterest's own links.
    const html = `<!doctype html><html><head>
      <meta property="og:url" content="https://www.pinterest.com/pin/931752610428913779/">
      <meta content="https://www.walmart.com/ip/Coffee-Table/20624270463" data-app-link>
      <title>A coffee table</title></head><body>
      <a href="https://www.pinterest.com/someuser/">someuser</a>
      <p>Walnut finish mid-century coffee table</p></body></html>`;
    const page = toPageContent(html);

    check(
      "the destination is among the extracted links",
      page.links.some((l) => l.includes("walmart.com")),
      page.links.join(" | ")
    );
    check(
      "the campaign's destination matches",
      matchesUrl(page.links, "https://www.walmart.com/ip/Coffee-Table/20624270463")
    );
    // Tracking noise must not break an honest pin.
    check(
      "…still matches with tracking parameters on the required URL",
      matchesUrl(
        page.links,
        "https://www.walmart.com/ip/Coffee-Table/20624270463?utm_source=pinterest"
      )
    );
    // The whole point: a pin pointing somewhere else must not pass.
    check(
      "a pin pointing at a different site does not match",
      !matchesUrl(page.links, "https://www.amazon.com/dp/B000000000")
    );
    check(
      "…and the pin's own URL is not mistaken for its destination",
      !matchesUrl(
        ["https://www.pinterest.com/pin/931752610428913779/"],
        "https://www.walmart.com/ip/Coffee-Table/20624270463"
      )
    );
  }

  /* ── 5. Both gates are actually wired in ── */
  console.log("\n5. The submit route enforces both gates");
  {
    const src = read("src/app/api/tasks/[id]/submit/route.ts");
    check(
      "the shape gate runs on the submitted proof URL",
      /const shape = proofUrlRule\(socialCfg\.platform, cfgItem\.action\)/.test(src) &&
        /!shape\.test\(submittedUrl\)/.test(src),
      "without this a destination link pasted into the proof box is accepted"
    );
    check(
      "the destination becomes a criterion the page is checked against",
      /destinationFieldFor\(cfg\.platform, it\.action\)/.test(src) &&
        /kind: "url" as const, value: dest/.test(src)
    );
    check(
      "the pin is fetched even when the admin set no verify mode",
      /!!x\.implicit/.test(src),
      "otherwise nothing is downloaded and the destination is never seen"
    );
    check(
      "the item is evaluated even when the admin set no verify mode",
      /it\.verify === "CONTENT" \|\| implicit/.test(src)
    );
    // An admin who wrote their own rules must not lose them.
    check(
      "the admin's own criteria are merged, not replaced",
      /\.\.\.\(configured\?\.criteria \?\? \[\]\)/.test(src)
    );
    // The safety rule. A pin we could not read is a fetch problem, not a
    // dishonest user, and must never auto-reject.
    check(
      "an unreadable pin goes to a human, not to a rejection",
      /onMismatch: "manual" as const/.test(src),
      "shouldAutoReject is still the only thing that may reject, and only where the admin asked"
    );

    // The last link in the chain, and the one the owner actually asked for:
    // a matching pin APPROVES, with nothing for the admin to switch on.
    //
    // Auto-approval requires every item in the bundle to have been verified,
    // counted as `verifyIdx.length === cfg.items.length`. That equality is why
    // the implicit rule had to join `verifyIdx` rather than being checked off
    // to the side — an item verified outside it would make the counts disagree
    // and send a perfectly good pin to manual review instead.
    check(
      "a verified item feeds the auto-approve decision",
      /socialCodeAutoApprove =[\s\S]{0,40}allVerified && verifyIdx\.length === cfg\.items\.length/.test(
        src
      ),
      "the count must include the implicitly-verified item or it never approves"
    );
    check(
      "a matching destination is recorded as verified",
      /evaluation\.verdict === "verified"\s*\?\s*"verified"/.test(src)
    );
    check(
      "…and anything else stops the approval",
      /if \(status !== "verified"\) allVerified = false;/.test(src)
    );
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
  void isPinterestPinUrl;
}

main();
