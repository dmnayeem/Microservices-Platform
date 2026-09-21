/**
 * Article Task Configuration
 * --------------------------
 * Article tasks ask users to read content at one or more URLs and submit
 * proof of completion (URL, screenshot, and/or a unique key extracted from
 * the article).
 *
 * On submit, ARTICLE submissions go to PENDING status; admin manually
 * approves to credit points. Optionally, admin can set a unique key —
 * users must enter it correctly to pass.
 */

export interface ArticleLink {
  url: string;
  label?: string;
}

/**
 * One clickable text snippet that the embed renders inline on an article
 * page. Multiple per page — admin defines the line, the text color, and an
 * optional background highlight color. User must click each one to dismiss
 * it; once all are clicked, the page is "done" and the user advances.
 */
/**
 * Where a single popup text appears within the article body.
 *   - "top"        : near the top of the article
 *   - "quarter"    : ~25% down
 *   - "middle"     : ~50% down (center)
 *   - "three-quarter": ~75% down
 *   - "bottom"     : near the bottom of the article
 *   - "random"     : auto-pick one of the above (default; varies per click)
 */
export type PopupTextPosition =
  | "top"
  | "quarter"
  | "middle"
  | "three-quarter"
  | "bottom"
  | "random";

export interface ArticlePopupItem {
  /** The clickable line, e.g. "Read this content everyday". */
  text: string;
  /** Text color (hex). Optional — falls back to the global popupTextColor. */
  textColor?: string;
  /** Background highlight color (hex). Optional. */
  highlightColor?: string;
  /**
   * v3.5: where this popup appears in the article body. Default
   * "random" — server picks a slot when this popup reveals.
   */
  position?: PopupTextPosition;
  /**
   * v3.5: seconds the user must dwell before THIS popup reveals
   * (relative to the previous click, or page load for the first one).
   * Falls back to the page's `popupIntervalSeconds` if unset.
   */
  delaySeconds?: number;
}

export interface ArticlePage {
  url: string;
  label?: string;
  /**
   * Legacy: number of popups required on this page (used when `popups` is
   * empty). Embed v2 prefers the explicit `popups` array.
   */
  popupCount: number;
  /**
   * Inline clickable text snippets shown on this page. The user must click
   * each one to advance. Each item carries its own colors so the admin can
   * make them look like contextual ads in the article body.
   */
  popups?: ArticlePopupItem[];
  /**
   * v3: minimum dwell time (seconds) the user must spend on this page
   * before progress counts. Tab-hidden / 30s-idle pauses the counter.
   * Default: 30.
   */
  minDwellSeconds?: number;
  /**
   * v3: minimum scroll depth (% of document height) the user must reach.
   * Default: 60.
   */
  minScrollPercent?: number;
  /**
   * v3.1: seconds the user must spend on the page (since the previous
   * popup was clicked, or since page load for the first one) before the
   * next popup reveals. Forces real reading time between clicks. Default 15.
   */
  popupIntervalSeconds?: number;
  /**
   * v3.1: seconds before the FIRST popup reveals after page load. Lets
   * the user start reading naturally. Default 5.
   */
  firstPopupDelaySeconds?: number;
  /**
   * v3.3: total number of popups the user must click on this page before
   * advancing. The admin's popup-text list cycles to fill this count. If
   * unset, defaults to popups.length.
   */
  popupClickCount?: number;
}

/**
 * How the worker is required to ARRIVE at the publisher's page.
 *
 * The journey itself — popups, dwell, scroll, the key at the end — is
 * identical in all three modes and is not touched by any of this. The only
 * thing that changes is where the visitor comes from, and therefore what the
 * publisher's own analytics record as the traffic source.
 *
 *   direct    Today's flow. We hand the worker a link carrying a signed token
 *             and they click it. Absent config means this, so every task that
 *             exists right now keeps behaving exactly as it does.
 *   search    The worker is given a keyword and a site NAME, searches for it,
 *             and clicks the organic result. Arrival is evidenced by the
 *             referrer being a search engine.
 *   referral  The worker opens a public social post, and clicks the link
 *             inside it. Arrival is evidenced by a tag WE mint and the admin
 *             pastes into that link — a tag survives the in-app browsers that
 *             strip referrers, which is most of the mobile social traffic.
 *
 * The two non-direct modes have no signed token in the URL, because neither an
 * organic search result nor a public post can carry one: the post link is the
 * same for every reader. They do not need one. The embed knows its task from
 * the `data-task` attribute on its own script tag; the key is the proof of who
 * did the work, and it is bound to a user when it is submitted.
 */
export type ArticleEntryMode = "direct" | "search" | "referral";

/** Which search engines' referrers count as a search arrival. */
export type ArticleSearchEngine = "google" | "bing" | "any";

/**
 * What to do when the arrival source cannot be determined at all.
 *
 * A browser that sends no referrer is indistinguishable from a worker who
 * typed the domain into the address bar — the two look identical from the
 * page, and no amount of code separates them. So it is a policy question, not
 * a technical one, and the admin answers it:
 *
 *   review  let them through, and send the submission to manual review
 *   block   refuse to start the journey
 *
 * `review` is the default because blocking punishes a worker for a privacy
 * setting they may not know they have.
 */
export type ArticleUnknownSourcePolicy = "review" | "block";

export interface ArticleEntryConfig {
  mode: ArticleEntryMode;
  /** search: what the worker is told to type into the search box. */
  searchKeyword?: string;
  /** search: whose referrer counts. Default "any". */
  searchEngine?: ArticleSearchEngine;
  /** referral: the public post the worker opens first. */
  postUrl?: string;
  /**
   * referral + search: the page on the publisher's site the worker must land
   * on. It has to be one of `pages` — the embed only exists there, so a
   * landing page without it is a journey that can never start.
   */
  landingUrl?: string;
  /**
   * referral: the tag minted for this task. The admin pastes the tagged link
   * into their post; the embed reads it back from `location.search`.
   */
  srcTag?: string;
  /** Default "review". See ArticleUnknownSourcePolicy. */
  onUnknownSource?: ArticleUnknownSourcePolicy;
}

export interface ArticleConfig {
  /** @deprecated v1 single-link mode — kept for backward compat. */
  links: ArticleLink[];
  keywords: string[];
  proofRequirements: {
    url: boolean;
    screenshot: boolean;
    uniqueKey: boolean;
  };
  uniqueKey?: string;
  uniqueKeyHint?: string;

  // ── v2 (key-pool) fields ────────────────────────────────────────────────
  /** When true, task uses the multi-page + key-pool flow (cross-domain embed). */
  useKeyPool?: boolean;
  /** Ordered list of pages the user must visit. */
  pages?: ArticlePage[];
  /** Title shown above the popup body (admin-set). */
  popupTitle?: string;
  /** Body HTML rendered inside each popup (admin-set, sanitized to strip <script>). */
  popupHtml?: string;
  /** Seconds the user must wait before they can dismiss a popup. */
  popupDelaySeconds?: number;
  /** Optional CTA label on the final-page key-generation button. */
  generateKeyButtonLabel?: string;
  /** Popup body text color (hex). */
  popupTextColor?: string;
  /** Popup background color (hex). */
  popupBgColor?: string;
  /** Popup accent color used for the primary button (hex). */
  popupAccentColor?: string;
  /**
   * v3: engagement gating mode.
   *   - "natural" (default): full anti-bot suite — dwell + scroll + visibility
   *     + per-user seeded waypoints + click integrity. Recommended for
   *     production traffic.
   *   - "fast": skip all gates. Admin smoke testing only.
   */
  engagementMode?: "natural" | "fast";
  /**
   * v3.1: short instructional message shown as a toast right after the
   * user clicks a popup, telling them what to do next (e.g. "Keep
   * reading — the next prompt will appear soon"). Admin-configured.
   */
  popupAfterClickMessage?: string;

  /**
   * v4: where the worker must come FROM. Absent means "direct", which is what
   * every existing task is, so nothing that exists today changes.
   */
  entry?: ArticleEntryConfig;

  /**
   * BUYER "write an article" variant.
   *
   * Present = this is a commissioned WRITING task, not the admin's
   * read-through-my-pages flow. The two share the `articleConfig` column and
   * nothing else: when `writing` is set, `useKeyPool` is false, `pages` is
   * empty, and the worker submits prose instead of visiting URLs.
   *
   * Readers should branch on `writing` rather than on `useKeyPool`, because
   * "not key pool" also covers the legacy single-link article task.
   */
  writing?: {
    /** What the buyer wants written. Shown to the worker before they start. */
    brief: string;
    /** Submissions below this are refused — see /api/tasks/[id]/submit. */
    minWords: number;
    /** Also require a link to where it was published. */
    requireUrl: boolean;
    /** Also require a screenshot. */
    requireScreenshot: boolean;
  };
}

/** Default theme colors for the popup. Match the existing embed look. */
export const DEFAULT_POPUP_THEME = {
  textColor: "#f1f5f9",
  bgColor: "#0f172a",
  accentColor: "#6366f1",
} as const;

export function emptyArticleConfig(): ArticleConfig {
  return {
    links: [{ url: "", label: "" }],
    keywords: [],
    proofRequirements: {
      url: true,
      screenshot: false,
      uniqueKey: false,
    },
    uniqueKey: "",
    uniqueKeyHint: "",
    useKeyPool: false,
    pages: [],
    popupTitle: "Continue reading",
    popupHtml:
      "<p>Thanks for reading! Click below to continue to the next section.</p>",
    popupDelaySeconds: 5,
    generateKeyButtonLabel: "Generate My Unique Key",
    popupTextColor: DEFAULT_POPUP_THEME.textColor,
    popupBgColor: DEFAULT_POPUP_THEME.bgColor,
    popupAccentColor: DEFAULT_POPUP_THEME.accentColor,
    engagementMode: "natural",
    popupAfterClickMessage:
      "Nice — keep reading, the next prompt will appear soon.",
  };
}

/**
 * Hosts whose referrer counts as "arrived from a search".
 *
 * Google is matched by prefix because it runs a country domain per market —
 * google.co.uk, google.com.bd and a hundred others — and a worker in Dhaka
 * searching on google.com.bd is doing exactly what was asked of them.
 */
export const SEARCH_ENGINE_HOSTS: Record<ArticleSearchEngine, string[]> = {
  google: ["google."],
  bing: ["bing.com"],
  any: [
    "google.",
    "bing.com",
    "duckduckgo.com",
    "search.yahoo.",
    "yandex.",
    "ecosia.org",
    "search.brave.com",
    "baidu.com",
  ],
};

/**
 * Link shims the social platforms bounce outbound clicks through. A reader who
 * taps a link in a Facebook post does not arrive with `facebook.com` as the
 * referrer — they arrive from `l.facebook.com`, or from nothing at all if the
 * in-app browser stripped it. These are corroboration only: the `srcTag` on
 * the link is what actually carries the proof.
 */
export const SOCIAL_REFERRER_SHIMS = [
  "l.facebook.com",
  "lm.facebook.com",
  "m.facebook.com",
  "l.instagram.com",
  "t.co",
  "out.reddit.com",
  "lnkd.in",
  "away.vk.com",
  "youtube.com",
  "t.me",
];

/** Does `host` count as an arrival from `engine`? */
export function isSearchEngineHost(
  host: string,
  engine: ArticleSearchEngine = "any"
): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return (SEARCH_ENGINE_HOSTS[engine] ?? SEARCH_ENGINE_HOSTS.any).some((m) =>
    m.endsWith(".") ? h.startsWith(m) || h.includes(`.${m}`) : h === m || h.endsWith(`.${m}`)
  );
}

/**
 * Mint the tag the admin pastes into their social post.
 *
 * Short enough to survive a link preview without looking like tracking cruft,
 * long enough that guessing one is not worth anyone's time. Minted once per
 * task and then stable — regenerating it would silently break every post that
 * is already live.
 */
export function mintArticleSrcTag(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** The query parameter the srcTag travels in. */
export const ARTICLE_SRC_PARAM = "src";

/**
 * The link the admin is told to paste into their post: the landing page with
 * the task's tag attached. Built in one place so the admin UI, the validator
 * and the embed cannot disagree about its shape.
 */
export function buildTaggedLandingUrl(
  landingUrl: string,
  srcTag: string
): string {
  try {
    const u = new URL(landingUrl);
    u.searchParams.set(ARTICLE_SRC_PARAM, srcTag);
    return u.toString();
  } catch {
    return landingUrl;
  }
}

/**
 * Normalise whatever is stored in the JSON column into a config we can trust.
 *
 * Defensive on purpose: `articleConfig` is a JSON column, so a half-written
 * row, an older shape or a hand-edited value can all arrive here. An
 * unrecognised mode becomes "direct", which is the behaviour that was there
 * before any of this existed — the safe direction to fail in.
 */
export function coerceArticleEntry(
  raw: unknown
): ArticleEntryConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const mode = r.mode;
  if (mode !== "search" && mode !== "referral") return undefined;

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const engine = r.searchEngine;
  const policy = r.onUnknownSource;

  return {
    mode,
    searchKeyword: str(r.searchKeyword) || undefined,
    searchEngine:
      engine === "google" || engine === "bing" || engine === "any"
        ? engine
        : "any",
    postUrl: str(r.postUrl) || undefined,
    landingUrl: str(r.landingUrl) || undefined,
    srcTag: str(r.srcTag) || undefined,
    onUnknownSource: policy === "block" ? "block" : "review",
  };
}

/** The effective mode, treating anything unreadable as today's behaviour. */
export function articleEntryMode(cfg: ArticleConfig | null): ArticleEntryMode {
  return coerceArticleEntry(cfg?.entry)?.mode ?? "direct";
}

/**
 * What the embed concluded about how this visitor arrived.
 *
 *   search / referral  the arrival matched what the task asks for
 *   unknown            no referrer and no tag — which is ALSO what a typed-in
 *                      address looks like. The two are indistinguishable from
 *                      the page, so this is a held verdict, not a guilty one.
 *   mismatch           a referrer was present and it was the wrong one
 */
export type ArticleEntryVerdict =
  | "search"
  | "referral"
  | "unknown"
  | "mismatch";

export interface ArticleEntryEvidence {
  verdict: ArticleEntryVerdict;
  /** Host of `document.referrer`, or "" when there was none. */
  referrerHost: string;
  /** Whether the landing URL carried the task's tag (referral mode). */
  taggedMatch: boolean;
}

/**
 * Judge an arrival. Pure, so the rules can be tested without a browser.
 *
 * The honest limit, stated where the decision is made: `document.referrer` and
 * the landing URL are both reported BY the page, and a page runs in the
 * visitor's browser. Someone with developer tools can claim whatever they
 * like. That is true of every client-side signal, including the dwell and
 * scroll gates this feature sits beside, and the bar here is the same one:
 * enough that ordinary shortcuts do not pay, not a proof against a determined
 * forger. What actually bounds the loss is that keys are finite, single-use,
 * and bound to the first account that submits them.
 */
export function evaluateArticleEntry(
  entry: ArticleEntryConfig,
  referrer: string,
  landingUrl: string
): ArticleEntryEvidence {
  let referrerHost = "";
  try {
    if (referrer) referrerHost = new URL(referrer).host.toLowerCase();
  } catch {
    referrerHost = "";
  }

  let taggedMatch = false;
  if (entry.mode === "referral" && entry.srcTag) {
    try {
      taggedMatch =
        new URL(landingUrl).searchParams.get(ARTICLE_SRC_PARAM) ===
        entry.srcTag;
    } catch {
      taggedMatch = false;
    }
  }

  if (entry.mode === "search") {
    if (!referrerHost) return { verdict: "unknown", referrerHost, taggedMatch };
    return {
      verdict: isSearchEngineHost(referrerHost, entry.searchEngine ?? "any")
        ? "search"
        : "mismatch",
      referrerHost,
      taggedMatch,
    };
  }

  // Referral. The tag is the evidence; the referrer only corroborates, because
  // the in-app browsers that carry most social traffic strip it. A tagged
  // arrival is accepted whatever the referrer says — including none at all.
  if (taggedMatch) {
    return { verdict: "referral", referrerHost, taggedMatch };
  }
  if (!referrerHost) return { verdict: "unknown", referrerHost, taggedMatch };

  let postHost = "";
  try {
    if (entry.postUrl) postHost = new URL(entry.postUrl).host.toLowerCase();
  } catch {
    postHost = "";
  }
  const bare = referrerHost.replace(/^www\./, "");
  const fromSocial =
    (postHost && (bare === postHost.replace(/^www\./, "") || bare.endsWith(`.${postHost.replace(/^www\./, "")}`))) ||
    SOCIAL_REFERRER_SHIMS.some((h) => bare === h || bare.endsWith(`.${h}`));

  return {
    verdict: fromSocial ? "referral" : "mismatch",
    referrerHost,
    taggedMatch,
  };
}

/** Does this verdict satisfy the task, given the admin's strictness? */
export function entryVerdictAllows(
  entry: ArticleEntryConfig,
  verdict: ArticleEntryVerdict
): { start: boolean; autoApprove: boolean } {
  if (verdict === entry.mode) return { start: true, autoApprove: true };
  if (verdict === "unknown") {
    const block = entry.onUnknownSource === "block";
    // Let them work, but the submission is reviewed by a person. Never both
    // allow the journey and then auto-approve on evidence we do not have.
    return { start: !block, autoApprove: false };
  }
  return { start: false, autoApprove: false };
}

export function validateArticleConfig(
  cfg: ArticleConfig
): { ok: boolean; error?: string } {
  // v2 (key-pool) validation supersedes the legacy links check.
  if (cfg.useKeyPool) {
    const pages = (cfg.pages ?? []).filter((p) => p.url.trim());
    if (pages.length === 0) {
      return {
        ok: false,
        error: "Add at least one page URL when key pool is enabled",
      };
    }
    for (const p of pages) {
      try {
        new URL(p.url);
      } catch {
        return { ok: false, error: `Invalid page URL: ${p.url}` };
      }
      if (!Number.isFinite(p.popupCount) || p.popupCount < 0 || p.popupCount > 20) {
        return {
          ok: false,
          error: `Popup count for ${p.url} must be between 0 and 20`,
        };
      }
      // Embed needs at least one popup text to render — without it the
      // user lands on the page and sees nothing clickable.
      const popupTexts = (p.popups ?? []).filter((x) => x.text.trim());
      if (popupTexts.length === 0) {
        return {
          ok: false,
          error: `Page "${p.label || p.url}" needs at least 1 popup text.`,
        };
      }
    }
    if (
      cfg.popupHtml !== undefined &&
      cfg.popupHtml !== null &&
      cfg.popupHtml.length > 5000
    ) {
      return { ok: false, error: "Popup HTML is too long (max 5000 chars)" };
    }
    // v3 engagement-gate validation
    for (const p of pages) {
      if (
        p.minDwellSeconds !== undefined &&
        (!Number.isFinite(p.minDwellSeconds) ||
          p.minDwellSeconds < 0 ||
          p.minDwellSeconds > 600)
      ) {
        return {
          ok: false,
          error: `Min dwell seconds for ${p.url} must be between 0 and 600`,
        };
      }
      if (
        p.minScrollPercent !== undefined &&
        (!Number.isFinite(p.minScrollPercent) ||
          p.minScrollPercent < 0 ||
          p.minScrollPercent > 100)
      ) {
        return {
          ok: false,
          error: `Min scroll percent for ${p.url} must be between 0 and 100`,
        };
      }
      if (
        p.popupIntervalSeconds !== undefined &&
        (!Number.isFinite(p.popupIntervalSeconds) ||
          p.popupIntervalSeconds < 0 ||
          p.popupIntervalSeconds > 600)
      ) {
        return {
          ok: false,
          error: `Popup interval for ${p.url} must be between 0 and 600`,
        };
      }
      if (
        p.firstPopupDelaySeconds !== undefined &&
        (!Number.isFinite(p.firstPopupDelaySeconds) ||
          p.firstPopupDelaySeconds < 0 ||
          p.firstPopupDelaySeconds > 600)
      ) {
        return {
          ok: false,
          error: `First popup delay for ${p.url} must be between 0 and 600`,
        };
      }
    }
    if (
      cfg.popupAfterClickMessage !== undefined &&
      cfg.popupAfterClickMessage !== null &&
      cfg.popupAfterClickMessage.length > 200
    ) {
      return {
        ok: false,
        error: "Post-click message must be 200 chars or fewer",
      };
    }
    if (
      cfg.engagementMode !== undefined &&
      cfg.engagementMode !== "natural" &&
      cfg.engagementMode !== "fast"
    ) {
      return { ok: false, error: "Engagement mode must be 'natural' or 'fast'" };
    }

    // ── Arrival source ───────────────────────────────────────────────────
    // Only reached when the admin has actually chosen a non-direct mode;
    // `coerceArticleEntry` returns undefined for anything else, so a task
    // that has never heard of this feature skips the whole block.
    const entry = coerceArticleEntry(cfg.entry);
    if (entry) {
      // The landing page is where the journey begins, and the journey only
      // exists where the embed is. A landing URL on a host that carries no
      // page is a task that can never start — worth refusing at save time
      // rather than discovering from a worker's complaint.
      if (!entry.landingUrl) {
        return {
          ok: false,
          error: "Set the landing page the worker must arrive on",
        };
      }
      let landingHost = "";
      try {
        landingHost = new URL(entry.landingUrl).host.toLowerCase();
      } catch {
        return {
          ok: false,
          error: `Invalid landing URL: ${entry.landingUrl}`,
        };
      }
      const pageHosts = new Set(
        pages
          .map((pg) => {
            try {
              return new URL(pg.url).host.toLowerCase();
            } catch {
              return "";
            }
          })
          .filter(Boolean)
      );
      if (!pageHosts.has(landingHost)) {
        return {
          ok: false,
          error:
            `The landing page (${landingHost}) is not one of this task's pages. ` +
            `The embed only runs on those, so the journey could never start.`,
        };
      }

      if (entry.mode === "search") {
        if (!entry.searchKeyword) {
          return {
            ok: false,
            error: "Set the keyword the worker is told to search for",
          };
        }
        if (entry.searchKeyword.length > 120) {
          return {
            ok: false,
            error: "Search keyword must be 120 chars or fewer",
          };
        }
      }

      if (entry.mode === "referral") {
        if (!entry.postUrl) {
          return {
            ok: false,
            error: "Set the social post the worker opens first",
          };
        }
        try {
          new URL(entry.postUrl);
        } catch {
          return { ok: false, error: `Invalid post URL: ${entry.postUrl}` };
        }
        // The tag is what proves the arrival when the referrer is stripped,
        // which is most of mobile social traffic. Without it this mode has
        // no evidence at all, so it is not optional.
        if (!entry.srcTag) {
          return {
            ok: false,
            error:
              "This task has no source tag yet — reopen the entry section so one is minted, then paste the tagged link into your post",
          };
        }
        if (!/^[a-z0-9]{6,16}$/.test(entry.srcTag)) {
          return { ok: false, error: "Source tag must be 6-16 letters/digits" };
        }
      }
    }

    return { ok: true };
  }

  const cleanedLinks = cfg.links.filter((l) => l.url.trim());
  if (cleanedLinks.length === 0) {
    return { ok: false, error: "At least one article link is required" };
  }
  for (const link of cleanedLinks) {
    try {
      new URL(link.url);
    } catch {
      return { ok: false, error: `Invalid link URL: ${link.url}` };
    }
  }
  if (cfg.proofRequirements.uniqueKey && !cfg.uniqueKey?.trim()) {
    return {
      ok: false,
      error: "Unique key value is required when 'Unique Key' proof is enabled",
    };
  }
  return { ok: true };
}

/** Compare submitted key with expected, case-insensitive trim */
export function compareUniqueKey(
  submitted: string | null | undefined,
  expected: string | null | undefined
): boolean {
  const a = (submitted ?? "").trim().toLowerCase();
  const b = (expected ?? "").trim().toLowerCase();
  return a !== "" && a === b;
}

/** Generate a single random key (e.g. "XK-7A3B-9F2D-E14C"). */
export function generateRandomArticleKey(): string {
  // 12 chars from a 32-letter alphabet (no I/O/0/1 to reduce confusion)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(12);
  if (typeof globalThis.crypto !== "undefined") {
    globalThis.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  let s = "";
  for (let i = 0; i < arr.length; i++) {
    s += alphabet[arr[i] % alphabet.length];
    if (i === 3 || i === 7) s += "-";
  }
  return s;
}

/** Strip script/iframe/object/embed tags from admin popup HTML. */
export function sanitizePopupHtml(html: string): string {
  return html
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*script\b[^>]*\/?\s*>/gi, "")
    .replace(/<\s*(iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(iframe|object|embed)\b[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript\s*:/gi, "");
}

// ─── v3 engagement: seeded RNG + per-user plan builder ─────────────────────

/** Default engagement gate values when admin hasn't set per-page overrides. */
export const DEFAULT_ENGAGEMENT = {
  minDwellSeconds: 30,
  minScrollPercent: 60,
} as const;

/**
 * Tiny deterministic RNG seeded from a hex string. Uses the mulberry32
 * algorithm — sufficient for shuffle/jitter, not crypto.
 */
export function seededRandom(seedHex: string): () => number {
  // Hash the hex string into a 32-bit seed. Cheap djb2-style.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedHex.length; i++) {
    h = Math.imul(h ^ seedHex.charCodeAt(i), 16777619) >>> 0;
  }
  let state = h || 1;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Visual placement style for a single popup badge. All popups now render
 * INLINE within the article body (between paragraphs / inside the main
 * content area). The variation per user comes from the scroll waypoints
 * — not from horizontal placement — so badges stay inside the article's
 * structure and never end up in the sidebar or page header.
 */
export type PopupPosition = "inline";

const ALL_POSITIONS: PopupPosition[] = ["inline"];

export interface EngagementPlan {
  mode: "natural" | "fast";
  /** Min dwell time in seconds before clicks are accepted. */
  minDwellSeconds: number;
  /** Min scroll depth as a fraction of document height (0–100). */
  minScrollPercent: number;
  /**
   * Per-popup scroll-percent waypoints. Length matches popups.length. The
   * embed reveals popup[i] only when the user has scrolled past
   * waypoints[i] (% of document height).
   */
  waypoints: number[];
  /**
   * Indices into the page's popups[] array, in display order. Different
   * users see different orderings of the same content.
   */
  popupOrder: number[];
  /**
   * Per-popup placement style — assigned per-user so same task looks
   * different for each user (no two badges in the same spot for one user
   * either, where possible).
   */
  positions: PopupPosition[];
  /** Random per-user timing offset (±15%) applied to the embed's delays. */
  delayJitterMs: number;
}

/**
 * Build a deterministic engagement plan for one user/task/page. Same inputs
 * → same output, so a refresh resumes identically.
 */
/**
 * How many popups this page ACTUALLY shows — the one number that decides both
 * what the embed draws and what the server accepts as "page finished".
 *
 * These were two different numbers. The embed renders `page.popups` when the
 * admin has defined them and falls back to synthesising `popupCount`
 * placeholders when they have not; but `popup-progress` and `generate-key`
 * both read `popupCount` directly. An admin who set the count to 2 and then
 * wrote a single popup produced a page that could never be completed: the
 * reader clicked the only popup there was, the server kept waiting for a
 * second one, the page never flipped to done, and the unique key was never
 * issued. From the outside it looked exactly like "the popups don't work".
 *
 * The rendered list wins wherever it exists, because that is what a reader can
 * physically click. `popupCount` remains the fallback for older tasks that
 * never had a `popups` array.
 */
export function renderedPopupCount(page: ArticlePage): number {
  const defined = (page.popups ?? []).filter(
    (p) => String(p?.text ?? "").trim().length > 0
  ).length;
  return defined > 0 ? defined : page.popupCount;
}

export function buildEngagementPlan(
  seedHex: string,
  popupCount: number,
  page: ArticlePage,
  mode: "natural" | "fast" = "natural"
): EngagementPlan {
  const minDwellSeconds =
    page.minDwellSeconds ?? DEFAULT_ENGAGEMENT.minDwellSeconds;
  const minScrollPercent =
    page.minScrollPercent ?? DEFAULT_ENGAGEMENT.minScrollPercent;

  if (mode === "fast") {
    return {
      mode,
      minDwellSeconds: 0,
      minScrollPercent: 0,
      waypoints: Array.from({ length: popupCount }, () => 0),
      popupOrder: Array.from({ length: popupCount }, (_, i) => i),
      positions: Array.from({ length: popupCount }, () => "inline" as PopupPosition),
      delayJitterMs: 0,
    };
  }

  const rng = seededRandom(seedHex);

  // Waypoints: spread across 15–95% range, each user's spacing slightly
  // different. With popupCount=3 and 15–95 range, base anchors are 15, 55,
  // 95; we then jitter each by ±10%.
  const waypoints: number[] = [];
  if (popupCount > 0) {
    const lower = 15;
    const upper = 95;
    const step = (upper - lower) / Math.max(1, popupCount);
    for (let i = 0; i < popupCount; i++) {
      const base = lower + step * (i + 0.5);
      const jitter = (rng() - 0.5) * (step * 0.6); // ±30% of step
      const v = Math.max(5, Math.min(98, Math.round(base + jitter)));
      waypoints.push(v);
    }
    waypoints.sort((a, b) => a - b);
  }

  // popupOrder: Fisher-Yates shuffle so user A sees [0,2,1] and user B
  // sees [1,0,2]. Combined with the waypoint jitter, each user's path
  // through the page is meaningfully different.
  const popupOrder = Array.from({ length: popupCount }, (_, i) => i);
  for (let i = popupOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [popupOrder[i], popupOrder[j]] = [popupOrder[j], popupOrder[i]];
  }

  // positions: shuffle ALL_POSITIONS via the same RNG so each user gets a
  // different per-popup style. If popupCount > ALL_POSITIONS.length, cycle
  // through with another shuffle so we still have variety.
  const positions: PopupPosition[] = [];
  const pool = ALL_POSITIONS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let i = 0; i < popupCount; i++) {
    if (i < pool.length) {
      positions.push(pool[i]);
    } else {
      // Re-shuffle and continue — keeps variety even with many popups.
      const next = ALL_POSITIONS.slice();
      for (let k = next.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [next[k], next[j]] = [next[j], next[k]];
      }
      positions.push(next[i % next.length]);
    }
  }

  const delayJitterMs = Math.round((rng() - 0.5) * 1500); // ±750ms

  return {
    mode,
    minDwellSeconds,
    minScrollPercent,
    waypoints,
    popupOrder,
    positions,
    delayJitterMs,
  };
}
