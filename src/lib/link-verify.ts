/**
 * Smart Auto Verification — does a submitted proof page actually say what the
 * task asked for?
 *
 * A user finishes a social task and submits the URL of what they published. The
 * server already fetches that page to check the user's personal code
 * (`task-verify-code.ts`). This adds the other half: comparing the page against
 * criteria the admin set — a required link, keywords, hashtags, a username.
 *
 * ── Three verdicts, and the difference between two of them matters most ──
 *
 *   verified         every required criterion was found → safe to auto-approve
 *   criteria_failed  the page was READ, and it genuinely does not match
 *   unverifiable     we could not read the page at all
 *
 * `unverifiable` is not a soft `criteria_failed`. Facebook, Instagram, LinkedIn
 * and X serve a login page to any server-side fetch, so "we saw no keyword" is
 * usually a statement about our access, not about the user's work. Only
 * `criteria_failed` may ever auto-reject; `unverifiable` always goes to a human.
 * Getting that backwards would reject honest users for a limitation of ours,
 * which is the worst failure this feature can have.
 *
 * ── Why the text is extracted rather than substring-matched on raw HTML ──
 *
 * `contentHasCode` scans raw HTML, which is fine for an 8-character random code
 * — it cannot plausibly appear by accident. A keyword can: "discount" sits in a
 * nav menu, an analytics script, a cookie banner. So a corpus is built from the
 * parts of the document that represent what was published (OG/Twitter cards,
 * title, visible body) with scripts and styles removed first.
 *
 * Client-safe: no server-only imports, so the admin task builder and the submit
 * route share one definition of what a rule is.
 */

// `html-text`, NOT `link-preview` — the latter imports node:dns for its SSRF
// guard, and this file is imported (through social-tasks.ts) by the admin task
// builder in the browser.
import { decodeHtml, metaContent } from "@/lib/html-text";

/* ────────────────────────────── config ────────────────────────────── */

export type CriterionKind = "text" | "url" | "hashtag" | "username" | "usertag" | "code";

export const CRITERION_KINDS: CriterionKind[] = [
  "text",
  "url",
  "hashtag",
  "username",
  "usertag",
  "code",
];

/** What each rule means, in the words the admin sees. */
export const CRITERION_LABEL: Record<CriterionKind, string> = {
  text: "Contains text",
  url: "Contains link",
  hashtag: "Contains hashtag",
  username: "Mentions username",
  usertag: "Member's own username hashtag",
  code: "Personal verification code",
};

export const CRITERION_HINT: Record<CriterionKind, string> = {
  text: "A word or phrase that must appear in the post",
  url: "A link that must be in the post (tracking parameters are ignored)",
  hashtag: "With or without the #",
  username: "With or without the @",
  usertag: "#their-username — filled in per member (add it to the caption), no value needed",
  code: "The unique per-user code — no value needed, it is generated per user",
};

export interface Criterion {
  kind: CriterionKind;
  /** Ignored for `code`, which is derived per user. */
  value: string;
}

export interface ContentRules {
  criteria: Criterion[];
  /** "all" = every rule must match (default). "any" = one is enough. */
  matchMode: "all" | "any";
  /**
   * What to do when the page WAS readable and did not match.
   * Never consulted for `unverifiable`.
   *  - manual   an admin decides
   *  - reject   reject on any miss
   *  - partial  some rules matched → an admin decides; NOTHING matched → reject
   */
  onMismatch: "manual" | "reject" | "partial";
}

export function defaultContentRules(): ContentRules {
  return { criteria: [], matchMode: "all", onMismatch: "manual" };
}

/** Normalise anything stored in the task JSON into usable rules. */
export function parseContentRules(raw: unknown): ContentRules {
  const out = defaultContentRules();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.criteria)) {
    for (const c of r.criteria) {
      if (!c || typeof c !== "object") continue;
      const kind = (c as Criterion).kind;
      const value = (c as Criterion).value;
      if (!CRITERION_KINDS.includes(kind)) continue;
      // `code` needs no value; everything else without one is a rule that would
      // silently match anything, which is worse than not having it.
      if (kind === "code" || kind === "usertag") {
        out.criteria.push({ kind, value: "" });
        continue;
      }
      if (typeof value !== "string" || !value.trim()) continue;
      out.criteria.push({ kind, value: value.trim() });
    }
  }
  if (r.matchMode === "any") out.matchMode = "any";
  if (r.onMismatch === "reject") out.onMismatch = "reject";
  if (r.onMismatch === "partial") out.onMismatch = "partial";
  return out;
}

/** True when these rules can actually decide anything. */
export function hasUsableRules(rules: ContentRules): boolean {
  return rules.criteria.length > 0;
}

/* ────────────────────────────── extraction ────────────────────────────── */

export interface PageContent {
  /** Everything the page says, normalised for matching. */
  text: string;
  /** Every URL the page points at (hrefs, canonical, og:url, bare text URLs). */
  links: string[];
  /** Raw HTML, kept for the code check, which deliberately scans everything. */
  html: string;
}

/**
 * Collapse text for comparison: lowercase, strip accents, collapse whitespace.
 * Applied to BOTH sides of every text comparison so "Café" matches "cafe".
 */
export function normaliseText(s: string): string {
  return s
    .normalize("NFKD")
    // Combining diacritics, written as escapes: the literal characters are
    // invisible in an editor and one stray keystroke would silently break this.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// `svg` included: inline path data was landing in the extracted text as if
// it were prose, which both padded the "does this page have substance"
// check and could match a keyword by coincidence.
const STRIP_BLOCKS =
  /<(script|style|template|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * The page's own words.
 *
 * Meta cards first: on a social post they hold the caption, and they are the
 * part least polluted by site chrome. Then the visible body, with executable
 * and styling blocks removed BEFORE tags are stripped — otherwise a keyword
 * inside an inline script counts as the user having written it.
 */
/**
 * Cut an unterminated final block off a truncated page.
 *
 * A page bigger than the fetch cap arrives cut off, usually mid-`<script>`.
 * `STRIP_BLOCKS` needs a closing tag, so that last block survives and its
 * contents become "page text" — for a Pinterest pin that was 450KB of JSON
 * asset manifest, which made an empty page look densely full and defeated the
 * one judgement (`looksUnreadable`) that keeps us from auto-rejecting somebody
 * for a page we never actually read.
 *
 * Deliberately only ever trims a TAIL, and only when there is genuinely no
 * closing tag after the opener. An earlier regex version cut from the first
 * unclosed opener to the end and took a real Reddit post's whole body with it.
 */
function dropTruncatedTail(html: string): string {
  let cut = html.length;
  for (const tag of ["script", "style", "template", "noscript", "svg"]) {
    const open = html.toLowerCase().lastIndexOf(`<${tag}`);
    if (open === -1) continue;
    const close = html.toLowerCase().indexOf(`</${tag}>`, open);
    if (close === -1) cut = Math.min(cut, open);
  }
  return cut < html.length ? html.slice(0, cut) : html;
}

export function extractPageText(html: string): string {
  const meta = [
    metaContent(html, ["og:title"]),
    metaContent(html, ["og:description"]),
    metaContent(html, ["twitter:title"]),
    metaContent(html, ["twitter:description"]),
    metaContent(html, ["description"]),
  ].filter(Boolean);

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) meta.push(decodeHtml(titleMatch[1]));

  const body = dropTruncatedTail(html.replace(STRIP_BLOCKS, " ")).replace(
    /<[^>]+>/g,
    " "
  );

  return normaliseText(`${meta.join(" \n ")} \n ${decodeHtml(body)}`);
}

/** Every URL the page points at, so a required link is found wherever it sits. */
export function extractLinks(html: string): string[] {
  const out = new Set<string>();
  const push = (v?: string | null) => {
    const s = (v ?? "").trim();
    if (s && /^https?:\/\//i.test(s)) out.add(decodeHtml(s));
  };

  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi
  ))
    push(m[1]);
  push(metaContent(html, ["og:url"]));

  // Any absolute URL sitting in a meta `content` attribute.
  //
  // This is where Pinterest publishes a pin's DESTINATION — the link the pin
  // actually points at arrives as `<meta content="https://…" data-app-…>` and
  // nowhere else on the page. It is not `og:url` (that is the pin itself), so
  // naming specific keys would miss it, and the bare-URL scan below cannot see
  // it either, because that runs after tags — attributes and all — are stripped.
  for (const m of html.matchAll(/<meta[^>]+content=["'](https?:\/\/[^"']+)["']/gi))
    push(m[1]);

  // A URL named in embedded JSON, where the slashes are usually escaped.
  for (const m of html.matchAll(
    /["'](?:url|link|targetUrl|destination|canonical)["']\s*:\s*["'](https?:[^"']+)["']/gi
  ))
    push(m[1].replace(/\\\//g, "/"));

  // Bare URLs in the text — a caption often pastes a link without an anchor.
  const text = html.replace(STRIP_BLOCKS, " ").replace(/<[^>]+>/g, " ");
  for (const m of decodeHtml(text).matchAll(/https?:\/\/[^\s"'<>)\]]+/gi))
    push(m[0]);

  return [...out];
}

const LOGIN_WALL_TITLES = [
  "facebook",
  "instagram",
  "log in",
  "login",
  "log into facebook",
  "sign in",
  "x. it's what's happening",
  "just a moment...",
  "attention required! | cloudflare",
];

const LOGIN_WALL_PHRASES = [
  "log in to continue",
  "log in or sign up to view",
  "you must log in to continue",
  "please log in",
  "sign up to see photos",
  "this content isn't available",
  "enable javascript and cookies to continue",
];

/**
 * Did we get a login/consent/bot wall instead of the page?
 *
 * Heuristic and deliberately generous: a false "wall" costs a manual review, a
 * missed wall costs an unjust rejection. Erring toward "wall" is the cheap
 * mistake.
 */
export function detectLoginWall(html: string, text?: string): boolean {
  const corpus = text ?? extractPageText(html);
  // A real post page has substance. A wall is a few words and a form.
  if (corpus.length < 60) return true;

  const title = normaliseText(
    metaContent(html, ["og:title"]) ||
      (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
  );
  if (title && LOGIN_WALL_TITLES.includes(title)) return true;
  if (LOGIN_WALL_PHRASES.some((p) => corpus.includes(p))) return true;

  return false;
}

/**
 * Did we get a page, or only the shell of one?
 *
 * Sibling of `detectLoginWall`, and it exists because of a real miss found by
 * fetching an actual Pinterest pin. Pinterest answers a server-side fetch with
 * ~1MB of HTML containing no post data at all -- the pin title, description and
 * destination link are EMPTY in its embedded JSON and filled in by the browser
 * afterwards. That page is not a login wall: it is long, it has an ordinary
 * title and it trips none of the phrases above. So it reached the matcher,
 * matched nothing, and came out `criteria_failed` -- which on a task set to
 * auto-reject would have rejected every honest Pinterest submission for a
 * limitation that is entirely ours.
 *
 * Two signatures, both meaning "nothing was rendered server-side":
 *
 *  - **No links whatsoever.** Any genuinely rendered page points somewhere, if
 *    only at its own canonical URL or `og:url`. Zero means a shell.
 *  - **A large document yielding almost no prose.** Hundreds of KB of markup
 *    and two sentences is a JavaScript app that rendered nothing.
 *
 * Deliberately narrow, so a small honestly-readable page -- a plain blog post
 * that simply does not contain the required link -- still reaches
 * `criteria_failed` and can be rejected as the admin asked.
 */
export function looksUnreadable(page: PageContent): boolean {
  if (page.links.length === 0) return true;
  if (page.html.length > 200_000 && page.text.length < 400) return true;
  return false;
}

export function toPageContent(html: string): PageContent {
  return { text: extractPageText(html), links: extractLinks(html), html };
}

/* ────────────────────────────── matching ────────────────────────────── */

/**
 * Reduce a URL to the part that identifies it.
 *
 * Real posts carry tracking junk the admin never typed — `?utm_source=`,
 * `?fbclid=`, `www.`, a trailing slash, http vs https. Comparing raw strings
 * would fail on a link that is, to any reader, the same link.
 */
export function normaliseUrl(raw: string): string {
  const s = raw.trim();
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

/** Required link present? Host must match exactly; path may be a prefix. */
export function matchesUrl(pageLinks: string[], required: string): boolean {
  const want = normaliseUrl(required);
  if (!want) return false;
  const [wantHost, ...wantPathParts] = want.split("/");
  const wantPath = wantPathParts.join("/");
  return pageLinks.some((link) => {
    const got = normaliseUrl(link);
    const [gotHost, ...gotPathParts] = got.split("/");
    if (gotHost !== wantHost) return false;
    if (!wantPath) return true;
    const gotPath = gotPathParts.join("/");
    return gotPath === wantPath || gotPath.startsWith(`${wantPath}/`);
  });
}

/** Plain phrase match on the extracted corpus. */
export function matchesText(pageText: string, phrase: string): boolean {
  const want = normaliseText(phrase);
  return !!want && pageText.includes(want);
}

/**
 * Hashtag match, on a word boundary.
 *
 * `#run` must not be satisfied by `#running` — a task that asked for one
 * campaign tag should not pass on a different one that merely starts the same.
 */
export function matchesHashtag(pageText: string, tag: string): boolean {
  const want = normaliseText(tag).replace(/^#/, "");
  if (!want) return false;
  const esc = want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`#${esc}(?![\\p{L}\\p{N}_])`, "u").test(pageText);
}

/** Username match, `@` optional on both sides. */
export function matchesUsername(
  pageText: string,
  handle: string,
  submittedUsername?: string | null
): boolean {
  const want = normaliseText(handle).replace(/^@/, "");
  if (!want) return false;
  // The admin may ask for "the user's own handle" — satisfied by what the user
  // declared on the submission when the page itself does not spell it out.
  if (
    submittedUsername &&
    normaliseText(submittedUsername).replace(/^@/, "") === want
  ) {
    return true;
  }
  const esc = want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@?${esc}(?![\\p{L}\\p{N}_])`, "u").test(pageText);
}

/* ────────────────────────────── evaluation ────────────────────────────── */

export type VerifyVerdict = "verified" | "criteria_failed" | "unverifiable";

export interface CriterionResult {
  kind: CriterionKind;
  value: string;
  matched: boolean;
  /** Shown to the admin on the review screen. */
  label: string;
}

export interface EvaluationContext {
  /** Username the user submitted for this item, if any. */
  submittedUsername?: string | null;
  /** The user's personal code, for a `code` criterion. */
  expectedCode?: string | null;
  /** Case-sensitive raw-HTML code check, reused from task-verify-code. */
  codeMatcher?: (html: string, code: string) => boolean;
  /** The member's own hashtag (lib/social-caption `userHashtag`), for `usertag`. */
  userTag?: string | null;
}

export interface Evaluation {
  verdict: VerifyVerdict;
  results: CriterionResult[];
  /** Human sentence for a rejection reason / review badge. */
  summary: string;
  /** How many rules matched (0 when the page was not read). */
  matched: number;
}

function describe(c: Criterion): string {
  if (c.kind === "code") return "personal verification code";
  if (c.kind === "usertag") return "your username hashtag";
  return `${CRITERION_LABEL[c.kind].toLowerCase()} “${c.value}”`;
}

/**
 * Compare a fetched page against the admin's rules.
 *
 * `page === null` means the fetch failed. That, and a detected login wall, both
 * return `unverifiable` WITHOUT consulting `onMismatch` — the caller must not be
 * able to turn our inability to read a page into a rejection.
 */
export function evaluateContentRules(
  page: PageContent | null,
  rules: ContentRules,
  ctx: EvaluationContext = {}
): Evaluation {
  if (!hasUsableRules(rules)) {
    return {
      verdict: "unverifiable",
      results: [],
      summary: "No verification rules configured",
      matched: 0,
    };
  }
  if (!page) {
    return {
      verdict: "unverifiable",
      results: [],
      summary: "Couldn't open the link to check it",
      matched: 0,
    };
  }
  if (detectLoginWall(page.html, page.text)) {
    return {
      verdict: "unverifiable",
      results: [],
      summary: "The page needs a login, so it couldn't be checked automatically",
      matched: 0,
    };
  }
  // Read nothing? Then we know nothing -- and "we know nothing" must never be
  // reported as "the user got it wrong". See `looksUnreadable`.
  if (looksUnreadable(page)) {
    return {
      verdict: "unverifiable",
      results: [],
      summary:
        "This page builds itself in the browser, so our server saw no content to check",
      matched: 0,
    };
  }

  const results: CriterionResult[] = rules.criteria.map((c) => {
    let matched = false;
    switch (c.kind) {
      case "text":
        matched = matchesText(page.text, c.value);
        break;
      case "url":
        matched = matchesUrl(page.links, c.value) || matchesText(page.text, normaliseUrl(c.value));
        break;
      case "hashtag":
        matched = matchesHashtag(page.text, c.value);
        break;
      case "username":
        matched = matchesUsername(page.text, c.value, ctx.submittedUsername);
        break;
      case "usertag":
        matched = !!ctx.userTag && matchesHashtag(page.text, ctx.userTag);
        break;
      case "code":
        matched =
          !!ctx.expectedCode &&
          !!ctx.codeMatcher &&
          ctx.codeMatcher(page.html, ctx.expectedCode);
        break;
    }
    return { kind: c.kind, value: c.value, matched, label: describe(c) };
  });

  const matchedCount = results.filter((r) => r.matched).length;
  const ok =
    rules.matchMode === "any" ? matchedCount > 0 : matchedCount === results.length;

  // State the match rate as a figure. "Matched all rules" is true but vague;
  // an admin glancing at a queue wants to see 3/3 — 100% and move on, and on a
  // near miss wants to see how near without reading every line.
  const pct = results.length
    ? Math.round((matchedCount / results.length) * 100)
    : 0;

  if (ok) {
    return {
      verdict: "verified",
      results,
      summary:
        rules.matchMode === "any"
          ? `${matchedCount}/${results.length} matched (any required) — passed`
          : `${matchedCount}/${results.length} matched — 100%`,
      matched: matchedCount,
    };
  }

  const missing = results.filter((r) => !r.matched).map((r) => r.label);
  return {
    verdict: "criteria_failed",
    results,
    summary: `${matchedCount}/${results.length} matched — ${pct}%. Missing ${missing.join(", ")}`,
    matched: matchedCount,
  };
}

/**
 * Should this verdict auto-reject?
 *
 * The one place that decision is made, so it cannot drift: only a page we
 * genuinely read, that genuinely did not match, on a task whose admin asked for
 * rejection.
 */
export function shouldAutoReject(
  verdict: VerifyVerdict,
  rules: ContentRules,
  /** Rules that did match. `partial` rejects only when this is 0. */
  matched = 0
): boolean {
  if (verdict !== "criteria_failed") return false;
  if (rules.onMismatch === "reject") return true;
  return rules.onMismatch === "partial" && matched === 0;
}

/** The member-facing reason on an automatic rejection (always English). */
export function autoRejectMessage(summary: string): string {
  return `Rejected because the task was not completed perfectly. ${summary}`;
}
