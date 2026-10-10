/**
 * VAST video ads — loaded by the VIEWER'S browser.
 *
 * The tag is never fetched by our server: the network must see the real
 * viewer (IP, user agent, cookies) to target and to judge traffic, and a
 * server fetch would make every request come from one data-centre address —
 * which networks reject as invalid traffic. VAST servers answer browsers
 * cross-origin by design (IAB VAST 3/4 requires CORS for HTML5 players).
 *
 * Supports VAST 2–4 linear ads: wrappers (up to 5 deep, their impression /
 * tracking / click-tracking URLs carried along), progressive MP4 / WebM media,
 * skip offset, quartile tracking. VPAID (JavaScript media) is not played.
 */

export type VastEvent =
  | "start"
  | "firstQuartile"
  | "midpoint"
  | "thirdQuartile"
  | "complete"
  | "mute"
  | "unmute"
  | "pause"
  | "resume"
  | "skip";

export interface VastAd {
  mediaUrl: string;
  mediaType: string;
  durationSec: number | null;
  /** Seconds before the viewer may skip; null = not skippable. */
  skipAfterSec: number | null;
  clickThrough: string | null;
  impressions: string[];
  clickTracking: string[];
  errors: string[];
  tracking: Partial<Record<VastEvent, string[]>>;
}

const MAX_WRAPPER_DEPTH = 5;
const FETCH_TIMEOUT_MS = 6000;

/** Standard macros a tag or tracker may carry. */
export function fillVastMacros(url: string, extra: Record<string, string> = {}): string {
  const values: Record<string, string> = {
    CACHEBUSTING: String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
    TIMESTAMP: new Date().toISOString(),
    PAGE_URL: typeof location !== "undefined" ? location.href : "",
    REFERRER_URL: typeof location !== "undefined" ? location.href : "",
    DOMAIN: typeof location !== "undefined" ? location.hostname : "",
    ...extra,
  };
  return url.replace(/\[([A-Z_]+)\]|%%([A-Z_]+)%%/g, (m, a: string | undefined, b: string | undefined) => {
    const k = (a ?? b) as string;
    return k in values ? encodeURIComponent(values[k]!) : m;
  });
}

/** Fire-and-forget tracking pixel. */
export function pingVast(urls: string[] | undefined, extra?: Record<string, string>) {
  for (const u of urls ?? []) {
    try {
      const img = new Image();
      img.referrerPolicy = "no-referrer-when-downgrade";
      img.src = fillVastMacros(u, extra);
    } catch {
      // a tracker failing must never break playback
    }
  }
}

const text = (el: Element | null | undefined) => (el?.textContent ?? "").trim();

function hms(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(v.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function fetchXml(url: string): Promise<Document | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // Credentialed first (networks use their cookie for frequency / targeting);
    // a server that doesn't allow credentials gets a plain retry.
    let res: Response | null = null;
    try {
      res = await fetch(fillVastMacros(url), { credentials: "include", signal: ctrl.signal });
    } catch {
      res = await fetch(fillVastMacros(url), { credentials: "omit", signal: ctrl.signal });
    }
    if (!res.ok) return null;
    const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
    return doc.querySelector("parsererror") ? null : doc;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function pickMedia(files: Element[]): { url: string; type: string } | null {
  const probe = typeof document !== "undefined" ? document.createElement("video") : null;
  const playable = files
    .map((f) => ({
      url: text(f),
      type: (f.getAttribute("type") ?? "").toLowerCase(),
      delivery: (f.getAttribute("delivery") ?? "progressive").toLowerCase(),
      width: Number(f.getAttribute("width")) || 0,
      api: (f.getAttribute("apiFramework") ?? "").toLowerCase(),
    }))
    .filter(
      (f) =>
        /^https?:\/\//i.test(f.url) &&
        f.delivery === "progressive" &&
        f.api !== "vpaid" &&
        (f.type === "video/mp4" || f.type === "video/webm") &&
        (!probe || probe.canPlayType(f.type) !== "")
    );
  if (playable.length === 0) return null;
  // Closest to a phone-to-laptop slot (~640px) — not the 1080p file.
  playable.sort((a, b) => Math.abs((a.width || 640) - 640) - Math.abs((b.width || 640) - 640));
  return { url: playable[0]!.url, type: playable[0]!.type };
}

/**
 * Load a VAST tag and resolve it to one playable linear ad, or null when the
 * network had nothing (an empty `<VAST/>`, no playable media, a timeout).
 */
export async function loadVast(tagUrl: string): Promise<VastAd | null> {
  const acc: Omit<VastAd, "mediaUrl" | "mediaType" | "durationSec" | "skipAfterSec" | "clickThrough"> = {
    impressions: [],
    clickTracking: [],
    errors: [],
    tracking: {},
  };
  let url = tagUrl;
  for (let depth = 0; depth <= MAX_WRAPPER_DEPTH; depth++) {
    const doc = await fetchXml(url);
    if (!doc) return null;
    const root = doc.querySelector("VAST");
    if (root) acc.errors.push(...Array.from(root.querySelectorAll(":scope > Error")).map(text).filter(Boolean));
    const ad = doc.querySelector("VAST > Ad");
    if (!ad) return null;
    const node = ad.querySelector(":scope > InLine, :scope > Wrapper");
    if (!node) return null;

    acc.impressions.push(...Array.from(node.querySelectorAll(":scope > Impression")).map(text).filter(Boolean));
    acc.errors.push(...Array.from(node.querySelectorAll(":scope > Error")).map(text).filter(Boolean));
    const linear = node.querySelector("Creatives Creative Linear");
    if (linear) {
      for (const t of Array.from(linear.querySelectorAll("TrackingEvents Tracking"))) {
        const ev = t.getAttribute("event") as VastEvent | null;
        const u = text(t);
        if (ev && u) (acc.tracking[ev] ??= []).push(u);
      }
      acc.clickTracking.push(...Array.from(linear.querySelectorAll("VideoClicks ClickTracking")).map(text).filter(Boolean));
    }

    if (node.tagName === "Wrapper") {
      const next = text(node.querySelector(":scope > VASTAdTagURI"));
      if (!next) return null;
      url = next;
      continue;
    }

    if (!linear) return null;
    const media = pickMedia(Array.from(linear.querySelectorAll("MediaFiles MediaFile")));
    if (!media) {
      pingVast(acc.errors, { ERRORCODE: "403" });
      return null;
    }
    const duration = hms(text(linear.querySelector(":scope > Duration")));
    const skipAttr = linear.getAttribute("skipoffset");
    let skipAfterSec: number | null = null;
    if (skipAttr) {
      const pct = /^(\d+(?:\.\d+)?)%$/.exec(skipAttr);
      skipAfterSec = pct && duration ? (Number(pct[1]) / 100) * duration : hms(skipAttr);
    }
    return {
      mediaUrl: media.url,
      mediaType: media.type,
      durationSec: duration,
      skipAfterSec,
      clickThrough: text(linear.querySelector("VideoClicks ClickThrough")) || null,
      ...acc,
    };
  }
  pingVast(acc.errors, { ERRORCODE: "302" });
  return null;
}
