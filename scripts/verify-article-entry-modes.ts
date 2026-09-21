/**
 * verify-article-entry-modes — how a worker is required to ARRIVE.
 *
 * The article journey itself is not in scope here and is not touched by this
 * feature: popups, dwell, scroll and the key at the end behave in all three
 * modes exactly as they do today. What this suite guards is the boundary —
 * that a task which has never heard of entry modes keeps behaving as `direct`,
 * and that a task which opts in cannot be saved in a state where the journey
 * could never start.
 *
 * Phase 1 of the plan: the config shape and its validation. Later phases add
 * the landing API, the embed's no-token branch, and the submit-side check;
 * this file grows with them.
 *
 * Run:  npx tsx --tsconfig tsconfig.script.json scripts/verify-article-entry-modes.ts
 */
import {
  articleEntryMode,
  buildTaggedLandingUrl,
  coerceArticleEntry,
  emptyArticleConfig,
  isSearchEngineHost,
  mintArticleSrcTag,
  validateArticleConfig,
  evaluateArticleEntry,
  entryVerdictAllows,
  ARTICLE_SRC_PARAM,
  type ArticleEntryConfig,
  type ArticleConfig,
  type ArticlePage,
  type ArticlePopupItem,
} from "../src/lib/article-tasks";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(label + (detail ? ` — ${detail}` : ""));
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A minimal task that already validates today, so tests vary one thing. */
function baseConfig(): ArticleConfig {
  return {
    ...emptyArticleConfig(),
    useKeyPool: true,
    pages: [
      {
        url: "https://example.com/article-one",
        popupCount: 2,
        popups: [{ text: "Continue reading" }] as ArticlePopupItem[],
      },
      {
        url: "https://example.com/article-two",
        popupCount: 2,
        popups: [{ text: "Next section" }] as ArticlePopupItem[],
      },
    ] as ArticlePage[],
  };
}

console.log("\nverify-article-entry-modes\n");

/* ══════════════════════════════════════════════════════════════════════════
   1. Nothing that exists today changes
   ══════════════════════════════════════════════════════════════════════════
   Every article task on the platform right now has no `entry` at all. If any
   of these three stop holding, this feature has reached back and altered
   tasks it was never meant to touch. */
{
  const cfg = baseConfig();
  check("a task with no entry config still validates", validateArticleConfig(cfg).ok);
  check("…and reads as direct", articleEntryMode(cfg) === "direct");
  check(
    "a brand-new config declares no entry mode",
    emptyArticleConfig().entry === undefined
  );
}

/* Anything unreadable in the JSON column also falls back to direct rather than
   to a half-configured gate. The safe direction to fail is the old behaviour. */
for (const [label, raw] of [
  ["null", null],
  ["a string", "search"],
  ["an unknown mode", { mode: "telepathy" }],
  ["mode missing", { searchKeyword: "x" }],
  ["explicitly direct", { mode: "direct" }],
] as const) {
  check(
    `${label} in the entry column reads as direct`,
    coerceArticleEntry(raw) === undefined
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   2. The normaliser fills the gaps it is allowed to fill
   ══════════════════════════════════════════════════════════════════════════ */
{
  const e = coerceArticleEntry({ mode: "search" });
  check("an unset search engine defaults to any", e?.searchEngine === "any");
  check(
    "an unset unknown-source policy defaults to review, not block",
    e?.onUnknownSource === "review",
    "blocking by default would punish a worker for a privacy setting"
  );
  const strict = coerceArticleEntry({ mode: "search", onUnknownSource: "block" });
  check("…but block is honoured when chosen", strict?.onUnknownSource === "block");
  const junk = coerceArticleEntry({ mode: "search", searchEngine: "askjeeves" });
  check("an unrecognised engine falls back to any", junk?.searchEngine === "any");
  const spaced = coerceArticleEntry({ mode: "search", searchKeyword: "  bd jobs  " });
  check("values are trimmed", spaced?.searchKeyword === "bd jobs");
  const empty = coerceArticleEntry({ mode: "search", searchKeyword: "   " });
  check(
    "a whitespace-only value becomes absent, not an empty string",
    empty?.searchKeyword === undefined
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   3. A task that could never start cannot be saved
   ══════════════════════════════════════════════════════════════════════════
   The embed exists only on the configured pages. A landing page anywhere else
   is a journey with no beginning, and the admin should hear that at save time
   rather than from a worker who cannot finish. */
{
  const noLanding = baseConfig();
  noLanding.entry = { mode: "search", searchKeyword: "bd jobs" };
  const r = validateArticleConfig(noLanding);
  check("a missing landing page is refused", !r.ok, r.error);

  const wrongHost = baseConfig();
  wrongHost.entry = {
    mode: "search",
    searchKeyword: "bd jobs",
    landingUrl: "https://somewhere-else.com/page",
  };
  const r2 = validateArticleConfig(wrongHost);
  check(
    "a landing page on a host with no embed is refused",
    !r2.ok && /not one of this task's pages/.test(r2.error ?? "")
  );

  const bad = baseConfig();
  bad.entry = { mode: "search", searchKeyword: "x", landingUrl: "not a url" };
  check("an unparseable landing URL is refused", !validateArticleConfig(bad).ok);

  const good = baseConfig();
  good.entry = {
    mode: "search",
    searchKeyword: "bd jobs",
    landingUrl: "https://example.com/article-one",
  };
  check("a complete search config validates", validateArticleConfig(good).ok);

  /* The landing page may carry its own query string — an admin's real URL
     usually does — so the check is on the host, not on an exact match. */
  const withQuery = baseConfig();
  withQuery.entry = {
    mode: "search",
    searchKeyword: "bd jobs",
    landingUrl: "https://example.com/article-one?utm_campaign=x",
  };
  check(
    "a landing URL with query params still validates",
    validateArticleConfig(withQuery).ok
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   4. Search mode needs the one thing the worker is told
   ══════════════════════════════════════════════════════════════════════════ */
{
  const noKeyword = baseConfig();
  noKeyword.entry = {
    mode: "search",
    landingUrl: "https://example.com/article-one",
  };
  check("search mode without a keyword is refused", !validateArticleConfig(noKeyword).ok);

  const long = baseConfig();
  long.entry = {
    mode: "search",
    searchKeyword: "x".repeat(121),
    landingUrl: "https://example.com/article-one",
  };
  check("an absurd keyword is refused", !validateArticleConfig(long).ok);
}

/* ══════════════════════════════════════════════════════════════════════════
   5. Referral mode needs the post AND the tag
   ══════════════════════════════════════════════════════════════════════════
   The tag is not a nicety. Facebook and Instagram in-app browsers strip the
   referrer, which is most of mobile social traffic, and without the tag this
   mode has no evidence of arrival at all. */
{
  const noPost = baseConfig();
  noPost.entry = {
    mode: "referral",
    landingUrl: "https://example.com/article-one",
    srcTag: "abc123",
  };
  check("referral without a post URL is refused", !validateArticleConfig(noPost).ok);

  const noTag = baseConfig();
  noTag.entry = {
    mode: "referral",
    postUrl: "https://facebook.com/post/1",
    landingUrl: "https://example.com/article-one",
  };
  const r = validateArticleConfig(noTag);
  check("referral without a source tag is refused", !r.ok, r.error);

  const badTag = baseConfig();
  badTag.entry = {
    mode: "referral",
    postUrl: "https://facebook.com/post/1",
    landingUrl: "https://example.com/article-one",
    srcTag: "NO",
  };
  check("a malformed tag is refused", !validateArticleConfig(badTag).ok);

  const ok = baseConfig();
  ok.entry = {
    mode: "referral",
    postUrl: "https://facebook.com/post/1",
    landingUrl: "https://example.com/article-one",
    srcTag: "k7m2qp4x",
  };
  check("a complete referral config validates", validateArticleConfig(ok).ok);
}

/* ══════════════════════════════════════════════════════════════════════════
   6. The tag, and the link the admin is told to paste
   ══════════════════════════════════════════════════════════════════════════ */
{
  const tags = new Set(Array.from({ length: 200 }, () => mintArticleSrcTag()));
  check("minted tags match their own format", [...tags].every((t) => /^[a-z0-9]{6,16}$/.test(t)));
  check(
    "200 mints produced no collision",
    tags.size === 200,
    `${tags.size} distinct`
  );
  check(
    "minted tags avoid characters that misread when copied by hand",
    [...tags].every((t) => !/[ilo01]/.test(t)),
    "an admin retyping a tag should not have to guess l from 1"
  );

  const tagged = buildTaggedLandingUrl("https://example.com/a?b=1", "k7m2qp4x");
  check(
    "the pasted link carries the tag alongside existing params",
    tagged.includes(`${ARTICLE_SRC_PARAM}=k7m2qp4x`) && tagged.includes("b=1")
  );
  check(
    "re-tagging replaces rather than appending a second one",
    (buildTaggedLandingUrl(tagged, "zzzz9999").match(/src=/g) ?? []).length === 1
  );
  check(
    "an unparseable URL is returned untouched rather than mangled",
    buildTaggedLandingUrl("not a url", "k7m2qp4x") === "not a url"
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   7. What counts as arriving from a search
   ══════════════════════════════════════════════════════════════════════════
   Google runs a domain per market. A worker in Dhaka searching on
   google.com.bd has done exactly what was asked, and a matcher that only knew
   google.com would have failed most of this platform's users. */
{
  for (const host of [
    "www.google.com",
    "google.com.bd",
    "www.google.co.uk",
    "bing.com",
    "duckduckgo.com",
    "search.yahoo.com",
    "yandex.com",
  ]) {
    check(`${host} counts as a search arrival`, isSearchEngineHost(host, "any"));
  }
  for (const host of ["example.com", "facebook.com", "notgoogle.com", ""]) {
    check(`${host || "(empty)"} does not`, !isSearchEngineHost(host, "any"));
  }
  check(
    "restricting to google excludes bing",
    isSearchEngineHost("google.com.bd", "google") &&
      !isSearchEngineHost("bing.com", "google")
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   8. Judging an arrival
   ══════════════════════════════════════════════════════════════════════════ */
const SEARCH: ArticleEntryConfig = {
  mode: "search",
  searchKeyword: "bd jobs",
  searchEngine: "any",
  landingUrl: "https://example.com/a",
  onUnknownSource: "review",
};
const REFERRAL: ArticleEntryConfig = {
  mode: "referral",
  postUrl: "https://www.facebook.com/page/posts/123",
  landingUrl: "https://example.com/a",
  srcTag: "k7m2qp4x",
  onUnknownSource: "review",
};

{
  const fromGoogle = evaluateArticleEntry(
    SEARCH,
    "https://www.google.com/",
    "https://example.com/a"
  );
  check("a Google referrer is a search arrival", fromGoogle.verdict === "search");

  const fromElsewhere = evaluateArticleEntry(
    SEARCH,
    "https://someforum.com/thread",
    "https://example.com/a"
  );
  check(
    "a referrer from somewhere else is a mismatch",
    fromElsewhere.verdict === "mismatch"
  );

  /* No referrer is the ambiguous case, and the one that decides whether this
     feature is fair. A typed-in address and a stripped referrer are the same
     thing from the page — so it is held, never called a mismatch. */
  const typedIn = evaluateArticleEntry(SEARCH, "", "https://example.com/a");
  check("no referrer is unknown, not mismatch", typedIn.verdict === "unknown");

  const junk = evaluateArticleEntry(SEARCH, "not a url", "https://example.com/a");
  check("an unparseable referrer is unknown, not a crash", junk.verdict === "unknown");

  const engineLocked = evaluateArticleEntry(
    { ...SEARCH, searchEngine: "google" },
    "https://www.bing.com/",
    "https://example.com/a"
  );
  check("restricting the engine rejects the other one", engineLocked.verdict === "mismatch");
}

/* Referral. The tag is the evidence; the referrer only corroborates, because
   the in-app browsers carrying most social traffic strip it. */
{
  const tagged = evaluateArticleEntry(
    REFERRAL,
    "",
    "https://example.com/a?src=k7m2qp4x"
  );
  check(
    "a tagged arrival counts even with NO referrer at all",
    tagged.verdict === "referral",
    "this is the whole reason the tag exists — in-app browsers strip referrers"
  );

  const wrongTag = evaluateArticleEntry(
    REFERRAL,
    "",
    "https://example.com/a?src=somethingelse"
  );
  check("a different task's tag does not count", wrongTag.verdict === "unknown");

  const shim = evaluateArticleEntry(
    REFERRAL,
    "https://l.facebook.com/l.php?u=x",
    "https://example.com/a"
  );
  check("Facebook's outbound shim counts as the post's referrer", shim.verdict === "referral");

  const samePlatform = evaluateArticleEntry(
    REFERRAL,
    "https://www.facebook.com/",
    "https://example.com/a"
  );
  check("the post's own host counts", samePlatform.verdict === "referral");

  const elsewhere = evaluateArticleEntry(
    REFERRAL,
    "https://www.google.com/",
    "https://example.com/a"
  );
  check(
    "arriving from search when a post was asked for is a mismatch",
    elsewhere.verdict === "mismatch"
  );

  const bare = evaluateArticleEntry(REFERRAL, "", "https://example.com/a");
  check("untagged and no referrer is unknown", bare.verdict === "unknown");
}

/* ══════════════════════════════════════════════════════════════════════════
   9. What a verdict permits
   ══════════════════════════════════════════════════════════════════════════
   The rule that keeps this honest in both directions: a held verdict lets the
   worker do the job, and does NOT auto-approve it. Never both allow the
   journey and then pay out on evidence we do not have. */
{
  const matched = entryVerdictAllows(SEARCH, "search");
  check("a matching arrival starts and auto-approves", matched.start && matched.autoApprove);

  const held = entryVerdictAllows(SEARCH, "unknown");
  check(
    "an unknown arrival starts but does NOT auto-approve",
    held.start && !held.autoApprove
  );

  const strict = entryVerdictAllows({ ...SEARCH, onUnknownSource: "block" }, "unknown");
  check("…unless the admin chose block, in which case it does not start", !strict.start);

  const wrong = entryVerdictAllows(SEARCH, "mismatch");
  check("a mismatch neither starts nor approves", !wrong.start && !wrong.autoApprove);

  check(
    "a referral verdict does not satisfy a search task",
    !entryVerdictAllows(SEARCH, "referral").autoApprove
  );
  check(
    "a search verdict does not satisfy a referral task",
    !entryVerdictAllows(REFERRAL, "search").autoApprove
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   10. The landing route answers before the journey, not after
   ══════════════════════════════════════════════════════════════════════════ */
{
  const route = readFileSync(
    join(process.cwd(), "src/app/api/article-tasks/[taskId]/landing/route.ts"),
    "utf8"
  );
  check("the landing route exists and speaks CORS", /corsResponse/.test(route));
  check("a direct task is told so rather than judged", /mode: "direct"/.test(route));
  check(
    "a refused arrival is given no signed note to present later",
    /start\s*\?\s*signArticleVisitToken/.test(route),
    "signing one anyway would let a refused visitor claim a key"
  );
  check(
    "the refusal message tells the worker what to do instead",
    /Go back and search for/.test(route)
  );
  check(
    "nothing is written — a public page costs no row per visitor",
    !/prisma\.\w+\.(create|update|upsert|delete)/.test(route)
  );
}

console.log(
  `\n${passed} passed, ${failed} failed\n` +
    (failures.length ? failures.map((f) => `  · ${f}`).join("\n") + "\n" : "")
);
if (failed > 0) process.exitCode = 1;
