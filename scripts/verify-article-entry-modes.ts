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
  ARTICLE_SRC_PARAM,
  type ArticleConfig,
  type ArticlePage,
  type ArticlePopupItem,
} from "../src/lib/article-tasks";

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

console.log(
  `\n${passed} passed, ${failed} failed\n` +
    (failures.length ? failures.map((f) => `  · ${f}`).join("\n") + "\n" : "")
);
if (failed > 0) process.exitCode = 1;
