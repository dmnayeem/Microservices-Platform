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
