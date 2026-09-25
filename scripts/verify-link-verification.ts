import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  CRITERION_KINDS,
  defaultContentRules,
  looksUnreadable,
  parseContentRules,
  hasUsableRules,
  normaliseText,
  normaliseUrl,
  extractPageText,
  extractLinks,
  detectLoginWall,
  toPageContent,
  matchesText,
  matchesUrl,
  matchesHashtag,
  matchesUsername,
  evaluateContentRules,
  shouldAutoReject,
  type ContentRules,
} from "../src/lib/link-verify";
import {
  normalizeSocialConfig,
  validateSocialBundle,
} from "../src/lib/social-tasks";

/**
 * Smart Auto Verification.
 *
 * The load-bearing rule in this feature is the difference between "we read the
 * page and it does not match" and "we could not read the page". Facebook and
 * Instagram serve a login wall to any server-side fetch, so the second case is
 * the COMMON one — and if it ever collapses into the first, the platform starts
 * rejecting honest users for a limitation of ours. Several assertions below
 * exist only to pin that apart, because it is exactly the distinction a later
 * refactor would flatten "for simplicity".
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-link-verification.ts
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
  }
}

const rules = (over: Partial<ContentRules> = {}): ContentRules => ({
  ...defaultContentRules(),
  ...over,
});

console.log("\n=== Smart Auto Verification ===\n");

/* ─────────────────────────────────────────────────────────── */
console.log("1. Reading the page");

const POST_HTML = `
<html><head>
  <title>My blog — new post</title>
  <meta property="og:title" content="I tried EarnGPT for a week" />
  <meta property="og:description" content="Sign up at https://earngpt.com/start and use #EarnGPT — thanks @earngpt!" />
  <script>var tracking = "secretkeyword and #NotReallyPosted";</script>
  <style>.x { content: "hiddenword"; }</style>
</head><body>
  <nav>Home About</nav>
  <p>Full write-up below. Visit <a href="https://www.earngpt.com/start?utm_source=fb">our page</a>.</p>
</body></html>`;

const page = toPageContent(POST_HTML);

check(
  "the caption is read out of the OG card",
  page.text.includes("i tried earngpt for a week") &&
    page.text.includes("thanks @earngpt")
);
check(
  "script contents are NOT part of the corpus",
  !page.text.includes("secretkeyword"),
  "raw-HTML matching would count a keyword inside an analytics script as the user having written it"
);
check("style contents are not either", !page.text.includes("hiddenword"));
check(
  "links are collected from anchors, and from bare URLs in the text",
  page.links.some((l) => l.includes("earngpt.com/start"))
);
check(
  "a normal post is not mistaken for a login wall",
  !detectLoginWall(POST_HTML)
);

const FB_LOGIN_HTML = `
<html><head>
  <title>Facebook</title>
  <meta property="og:title" content="Facebook" />
</head><body>
  <div>You must log in to continue.</div>
  <form action="/login"><input name="email"/></form>
</body></html>`;

check(
  "a Facebook login wall IS detected",
  detectLoginWall(FB_LOGIN_HTML),
  "this is the single most common outcome for the owner's own example task"
);
check(
  "a nearly-empty page is treated as a wall",
  detectLoginWall("<html><body>Log in</body></html>"),
  "a false 'wall' costs one manual review; a missed wall costs an unjust rejection"
);

/* ─────────────────────────────────────────────────────────── */
console.log("\n2. Matching");

check(
  "text matching ignores case and accents",
  matchesText(normaliseText("Visit our CAFÉ today"), "cafe today")
);
check(
  "text matching is not fooled by extra whitespace",
  matchesText(normaliseText("hello    world"), "hello world")
);

check(
  "a required link matches through tracking parameters",
  matchesUrl(["https://www.earngpt.com/start?utm_source=fb&fbclid=xyz"], "https://earngpt.com/start"),
  "a real post carries junk the admin never typed"
);
check(
  "…and through http/https, www and a trailing slash",
  matchesUrl(["http://earngpt.com/start/"], "https://www.earngpt.com/start")
);
check(
  "a DIFFERENT host does not match",
  !matchesUrl(["https://earngpt.com.evil.co/start"], "https://earngpt.com/start"),
  "host is compared exactly — a lookalike domain must not pass"
);
check(
  "a deeper path under the required one counts",
  matchesUrl(["https://earngpt.com/start/now"], "https://earngpt.com/start")
);
check(
  "a different path does not",
  !matchesUrl(["https://earngpt.com/other"], "https://earngpt.com/start")
);
check(
  "normaliseUrl survives a value that is not a URL at all",
  normaliseUrl("earngpt.com/start/") === "earngpt.com/start"
);

check("a hashtag matches with or without the #", matchesHashtag("post #earngpt here", "earngpt"));
check(
  "a hashtag does NOT match a longer one that starts the same",
  !matchesHashtag("i am #running today", "#run"),
  "a task that asked for one campaign tag must not pass on a different one"
);
check("a username matches with or without the @", matchesUsername("thanks @earngpt", "earngpt"));
check(
  "a username the user declared on the submission counts",
  matchesUsername("nothing here", "myhandle", "@myhandle"),
  "the page does not always spell out who posted it"
);
check(
  "a username does not match a longer handle",
  !matchesUsername("thanks @earngptpro", "@earngpt")
);

/* ─────────────────────────────────────────────────────────── */
console.log("\n3. Verdicts");

const allRules = rules({
  criteria: [
    { kind: "url", value: "https://earngpt.com/start" },
    { kind: "text", value: "tried EarnGPT" },
    { kind: "hashtag", value: "#EarnGPT" },
  ],
});

const good = evaluateContentRules(page, allRules);
check("a page that satisfies everything is verified", good.verdict === "verified");
check("…and every rule is reported as matched", good.results.every((r) => r.matched));

const missingTag = evaluateContentRules(
  toPageContent(POST_HTML.replace("#EarnGPT", "#Other")),
  allRules
);
check(
  "a page that was read but does not match is criteria_failed",
  missingTag.verdict === "criteria_failed"
);
check(
  "…and the summary names the rule that failed",
  missingTag.summary.toLowerCase().includes("hashtag"),
  "a rejection the user cannot act on is just a dead end"
);
check(
  "…while the rules that DID match are still reported as matched",
  missingTag.results.filter((r) => r.matched).length === 2,
  "the admin reviewing by hand needs the evidence, not just the verdict"
);

check(
  "matchMode 'any' passes on a single match",
  evaluateContentRules(
    toPageContent(POST_HTML.replace("#EarnGPT", "#Other")),
    rules({ ...allRules, matchMode: "any" })
  ).verdict === "verified"
);

/* ── the distinction the whole feature rests on ── */
check(
  "a login wall is unverifiable, NOT criteria_failed",
  evaluateContentRules(toPageContent(FB_LOGIN_HTML), allRules).verdict ===
    "unverifiable",
  "otherwise every Facebook submission becomes a rejection"
);
check(
  "a failed fetch is unverifiable",
  evaluateContentRules(null, allRules).verdict === "unverifiable"
);
check(
  "a task with no rules configured cannot verify anything",
  evaluateContentRules(page, rules()).verdict === "unverifiable" &&
    !hasUsableRules(rules()),
  "zero rules must not silently pass everything"
);

/* ─────────────────────────────────────────────────────────── */
console.log("\n4. When auto-reject is allowed");

const rejecting = rules({ ...allRules, onMismatch: "reject" });
check(
  "criteria_failed + reject → auto-reject",
  shouldAutoReject("criteria_failed", rejecting)
);
check(
  "criteria_failed + manual → no auto-reject",
  !shouldAutoReject("criteria_failed", rules({ ...allRules, onMismatch: "manual" }))
);
check(
  "UNVERIFIABLE never auto-rejects, even when set to reject",
  !shouldAutoReject("unverifiable", rejecting),
  "we must not punish a user for our own inability to read their page"
);
check(
  "a verified page obviously never auto-rejects",
  !shouldAutoReject("verified", rejecting)
);
check(
  "manual is the DEFAULT",
  defaultContentRules().onMismatch === "manual" &&
    defaultContentRules().matchMode === "all"
);

/* ─────────────────────────────────────────────────────────── */
console.log("\n5. Stored config");

check(
  "unknown criterion kinds are dropped",
  parseContentRules({ criteria: [{ kind: "sql", value: "x" }] }).criteria.length === 0
);
check(
  "empty values are dropped — a blank rule would match anything",
  parseContentRules({
    criteria: [
      { kind: "text", value: "   " },
      { kind: "text", value: "real" },
    ],
  }).criteria.length === 1
);
check(
  "a code criterion needs no value",
  parseContentRules({ criteria: [{ kind: "code", value: "" }] }).criteria.length === 1
);
check(
  "garbage falls back to the safe defaults",
  parseContentRules(null).onMismatch === "manual" &&
    parseContentRules("nonsense").matchMode === "all"
);
check(
  "an unrecognised mode is not trusted",
  parseContentRules({ matchMode: "sometimes", onMismatch: "ban" }).matchMode === "all" &&
    parseContentRules({ matchMode: "sometimes", onMismatch: "ban" }).onMismatch === "manual"
);
check(
  "every catalogued kind round-trips",
  CRITERION_KINDS.every(
    (k) =>
      parseContentRules({ criteria: [{ kind: k, value: "v" }] }).criteria[0]
        ?.kind === k
  )
);

const cfg = normalizeSocialConfig({
  items: [
    { action: "POST", points: 5, verify: "CONTENT", contentRules: { criteria: [{ kind: "text", value: "hi" }] } },
    { action: "LIKE", points: 1, verify: "CODE", contentRules: { criteria: [{ kind: "text", value: "stale" }] } },
    { action: "SHARE", points: 1 },
  ],
});
check(
  "a CONTENT item keeps its rules through the task config",
  cfg.items[0]?.contentRules?.criteria.length === 1
);
check(
  "a non-CONTENT item does not carry stale rules",
  cfg.items[1]?.contentRules === undefined,
  "switching the method away and back would otherwise silently revive old rules"
);
check(
  "a legacy item with no verify still normalises",
  cfg.items[2]?.verify === undefined && cfg.items[2]?.contentRules === undefined
);

// A switch that is on and does nothing is the failure mode this whole feature
// is meant to avoid, so it is refused at save time rather than discovered as
// "why is everything still in manual review".
const noRules = validateSocialBundle(
  normalizeSocialConfig({
    platform: "TWITTER",
    items: [
      {
        action: "REPLY",
        points: 5,
        fields: { targetUrl: "https://x.com/a/status/1", commentTemplate: "hi" },
        verify: "CONTENT",
        proofRequirements: { url: true, screenshot: false, username: false },
      },
    ],
  })
);
check(
  "saving a CONTENT item with NO rules is refused",
  !noRules.ok && /at least one verification rule/i.test(noRules.error ?? ""),
  "otherwise every submission silently goes to manual while the admin thinks it is automated"
);
const noUrl = validateSocialBundle(
  normalizeSocialConfig({
    platform: "TWITTER",
    items: [
      {
        action: "REPLY",
        points: 5,
        fields: { targetUrl: "https://x.com/a/status/1", commentTemplate: "hi" },
        verify: "CONTENT",
        contentRules: { criteria: [{ kind: "text", value: "hi" }] },
        proofRequirements: { url: false, screenshot: true, username: false },
      },
    ],
  })
);
check(
  "…and so is one with no proof URL to fetch",
  !noUrl.ok && /nothing to fetch/i.test(noUrl.error ?? "")
);

/* ─────────────────────────────────────────────────────────── */
console.log("\n6. Wiring");

const submit = code("src/app/api/tasks/[id]/submit/route.ts");
check(
  "the submit route evaluates CONTENT items",
  /it\.verify === "CONTENT"/.test(submit) && /evaluateContentRules\(/.test(submit)
);
check(
  "auto-reject goes through shouldAutoReject, not an inline condition",
  /shouldAutoReject\(evaluation\.verdict, rules\)/.test(submit),
  "one place decides it, so it cannot drift"
);
check(
  "proof pages are fetched ONCE each, in parallel",
  /new Set\(/.test(submit) && /Promise\.all\(\s*fetchUrls\.map/.test(submit),
  "the loop used to await a 6s-timeout fetch per item"
);
check(
  "the rejection rides the same atomic claim as approval",
  /autoRejected\s*&&\s*\{[\s\S]{0,160}rejectionReason: socialAutoRejectReason/.test(submit),
  "a second write would sit outside the guard that stops a double-submit"
);
check(
  "auto-reject applies no points penalty",
  !/penalty/i.test(
    submit.slice(submit.indexOf("autoRejected &&"), submit.indexOf("autoRejected &&") + 300)
  ),
  "a penalty is a deliberate admin act, not something a fetch decides"
);
check(
  "the user is told WHICH rule failed",
  /status: "rejected"[\s\S]{0,200}socialAutoRejectReason/.test(submit)
);
check(
  "per-rule detail is stored for the reviewer",
  /verifyDetails = evaluation\.results/.test(submit)
);

const detail = code("src/app/api/tasks/[id]/route.ts");
check(
  "the task page tells the user the rules BEFORE they publish",
  /socialContentRules/.test(detail),
  "a task that can auto-reject has to state its rules up front"
);
check(
  "the personal code is not repeated in that list",
  /c\.kind !== "code"/.test(detail)
);

const runView = code("src/components/user/tasks/social-task-run-view.tsx");
// Since 11e6b87 (the owner's request): a rule the user was already handed in
// the steps above — usually the pin's destination link — is not repeated. Any
// rule they were NOT given still shows, which is the case the warning exists for.
check(
  "the run view renders the requirements the user was not already given",
  /unlistedRules\s*=\s*\(contentRules\[idx\]\?\.labels/.test(runView) &&
    /item\.verify === "CONTENT" && unlistedRules\.length > 0/.test(runView)
);
check(
  "…and says plainly that FB/IG go to manual review",
  /Facebook, Instagram/.test(runView)
);

const builder = code("src/app/admin/tasks/_components/SocialTaskBuilder.tsx");
check(
  "the admin can add rules",
  /ContentRulesEditor/.test(builder) && /Add from task fields/.test(builder)
);
check(
  "turning it on forces a proof URL — there is nothing to fetch otherwise",
  /verify: "CONTENT",[\s\S]{0,220}url: true/.test(builder)
);
check(
  "the admin is warned which platforms cannot be read",
  /Pinterest and Facebook/.test(builder),
  "measured by fetching each one with the crawler UA: only these two return a page with no post content"
);
check(
  "…and the list of what DOES work is the measured one",
  /Reddit, X, LinkedIn, TikTok, Instagram, YouTube, Medium/.test(builder),
  "asking as a link-preview crawler unlocked Reddit, X, LinkedIn, TikTok and Instagram"
);
check(
  "…and says where a required-link rule will not work",
  /prefer <em>keyword<\/em>/.test(builder) &&
    /will not match/.test(builder),
  "Instagram and TikTok publish the caption but not the outgoing link"
);

const panel = code("src/components/admin/submissions/proof-panels/SocialProofPanel.tsx");
check(
  "the review screen distinguishes 'did not match' from 'could not check'",
  /criteria_failed/.test(panel) && /couldn't verify/.test(panel)
);
check(
  "…and lists the per-rule evidence",
  /verifyDetails/.test(panel) && /d\.matched/.test(panel)
);

/* ── the client bundle must not pull in node:dns ── */
const verifyLib = read("src/lib/link-verify.ts");
check(
  "link-verify does not import the server-only fetcher",
  !/from "@\/lib\/link-preview"/.test(verifyLib),
  "social-tasks.ts imports this and is used by the admin builder in the browser"
);
check(
  "the shared HTML helpers live in a client-safe module",
  // Actual imports, not the word appearing in a comment explaining why there
  // are none.
  !/from "node:/.test(read("src/lib/html-text.ts")) &&
    /from "@\/lib\/html-text"/.test(read("src/lib/link-preview.ts")),
  "one decoder for both, without dragging node:dns into the bundle"
);

/* ─────────────────────────────────────────────────────────────
   A page that rendered nothing is NOT a page that failed
   ───────────────────────────────────────────────────────────── */
console.log("\nJS shells are unverifiable, never failed");
{
  const shellRules = {
    ...defaultContentRules(),
    criteria: [{ kind: "url" as const, value: "https://earngpt.com/promo" }],
    onMismatch: "reject" as const,
  };

  // Measured against a real Pinterest pin: ~1MB of markup, no post content, no
  // links, and NOT a login wall — so it reached the matcher, matched nothing,
  // and came out `criteria_failed`. On a task set to auto-reject that would
  // have rejected every honest submission for a limitation that is ours.
  const shellPage = toPageContent(
    "<html><head><title>Pinterest</title></head><body><div>skip to content</div>" +
      "<script>" +
      "x".repeat(600000) +
      "</script></body></html>"
  );
  check(
    "a big page that rendered no content is UNVERIFIABLE",
    evaluateContentRules(shellPage, shellRules, {}).verdict === "unverifiable",
    "Pinterest/TikTok/Reddit answer a server fetch with an empty shell"
  );
  check(
    "…so it is never auto-rejected, even with reject configured",
    !shouldAutoReject(
      evaluateContentRules(shellPage, shellRules, {}).verdict,
      shellRules
    ),
    "rejecting here punishes the user for our inability to read the page"
  );
  check(
    "a page with NO links at all counts as unreadable",
    looksUnreadable(
      toPageContent("<html><body><p>hello there friend</p></body></html>")
    ),
    "any rendered page points somewhere — at minimum its own canonical/og:url"
  );

  // The other half: a page we really did read must still be rejectable, or the
  // guard above would have quietly disabled auto-reject altogether.
  const realHtml =
    "<html><head><title>Blog</title>" +
    "<link rel='canonical' href='https://blog.example.com/p/1'></head><body><article>" +
    "A real post about gardening. ".repeat(20) +
    "<a href='https://blog.example.com/about'>About</a></article></body></html>";
  const realPage = toPageContent(realHtml);
  check(
    "a readable page that genuinely lacks the link still FAILS",
    evaluateContentRules(realPage, shellRules, {}).verdict === "criteria_failed",
    "the fix must not turn every mismatch into couldn't-check"
  );
  check(
    "…and is auto-rejected when the admin asked for that",
    shouldAutoReject(
      evaluateContentRules(realPage, shellRules, {}).verdict,
      shellRules
    )
  );
  check(
    "…and passes once the link is there, tracking params and all",
    evaluateContentRules(
      toPageContent(
        realHtml.replace(
          "</article>",
          "<a href='https://earngpt.com/promo?utm_source=x&fbclid=y'>promo</a></article>"
        )
      ),
      shellRules,
      {}
    ).verdict === "verified"
  );
  check(
    "inline SVG path data is not treated as page text",
    !toPageContent(
      '<html><body><p>hello</p><svg><path d="m81.0376 13.122"/></svg></body></html>'
    ).text.includes("81.0376"),
    "path data as prose can match a keyword by coincidence and pad the substance check"
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
