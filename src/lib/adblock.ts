// Client-side ad-blocker detection + a tiny imperative store (mirrors
// ./reward-interstitial.ts). Task-open handlers `await ensureAdsAllowed()`; if a
// blocker is detected the shared overlay (rendered by <AdblockHost/>) is shown
// and the guard resolves false so the task never opens.
//
// Detection is heuristic and uses sacrificial bait the blocker is expected to
// kill (a /ads/ad.js script + a .adsbox element). It is same-origin only (no
// third-party call), fails OPEN on ambiguity, and never hard-locks the app.

declare global {
  interface Window {
    __abmBaitLoaded?: boolean;
  }
}

const CACHE_MS = 5000;
let cached: { blocked: boolean; at: number } | null = null;

/** Script bait: /ads/ad.js is blocked by filter lists, so on a blocked browser
 *  the flag never gets set (covers hard-error AND silent-empty responses). */
function scriptBaitBlocked(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      window.__abmBaitLoaded = false;
      const s = document.createElement("script");
      s.src = `/ads/ad.js?_=${Date.now()}_${Math.random().toString(36).slice(2)}`;
      s.async = true;
      let settled = false;
      const done = (blocked: boolean) => {
        if (settled) return;
        settled = true;
        s.remove();
        resolve(blocked);
      };
      s.onload = () => done(window.__abmBaitLoaded !== true);
      s.onerror = () => done(true);
      document.head.appendChild(s);
      // Safety: if neither event fires (blocker stalled the request), decide by
      // the flag after a short wait.
      setTimeout(() => done(window.__abmBaitLoaded !== true), 3000);
    } catch {
      resolve(false); // can't run bait → don't punish the user
    }
  });
}

/** Element bait: a div with classic ad class names; cosmetic filters hide it. */
function elementBaitBlocked(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const bait = document.createElement("div");
      bait.className = "adsbox ad-banner ad-placement pub_300x250 text-ad";
      bait.setAttribute("aria-hidden", "true");
      bait.style.cssText =
        "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;";
      document.body.appendChild(bait);
      // Two frames so the blocker's stylesheet has applied.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const cs = getComputedStyle(bait);
          const blocked =
            bait.offsetHeight === 0 ||
            bait.offsetParent === null ||
            cs.display === "none" ||
            cs.visibility === "hidden";
          bait.remove();
          resolve(blocked);
        })
      );
    } catch {
      resolve(false);
    }
  });
}

/** Run both baits; blocked if EITHER trips. Never throws. */
export async function detectAdblock(): Promise<boolean> {
  if (typeof document === "undefined") return false; // SSR
  try {
    const [s, e] = await Promise.all([
      scriptBaitBlocked(),
      elementBaitBlocked(),
    ]);
    return s || e;
  } catch {
    return false;
  }
}

async function detectCached(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && cached && now - cached.at < CACHE_MS) return cached.blocked;
  const blocked = await detectAdblock();
  cached = { blocked, at: now };
  return blocked;
}

// ── overlay store (mirrors reward-interstitial.ts) ──────────────────────────
let overlayOpen = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function setOverlay(open: boolean) {
  if (overlayOpen !== open) {
    overlayOpen = open;
    emit();
  }
}

export function subscribeAdblock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function getAdblockSnapshot(): boolean {
  return overlayOpen;
}
export function getAdblockServerSnapshot(): boolean {
  return false;
}

// Admin can disable the whole gate (antifraud.adblock_gate_enabled). The host
// fetches the config once and flips this; default ON so a config blip stays safe.
let gateEnabled = true;
export function setAdblockGateEnabled(on: boolean): void {
  gateEnabled = on;
}
export function isAdblockGateEnabled(): boolean {
  return gateEnabled;
}

/**
 * Guard for every task-open action. Resolves true when it's safe to open; when a
 * blocker is detected it opens the overlay ("turn off your ad blocker") and
 * resolves false so the caller aborts the open.
 */
export async function ensureAdsAllowed(): Promise<boolean> {
  if (!gateEnabled) return true; // admin turned the gate off
  const blocked = await detectCached();
  if (blocked) {
    setOverlay(true);
    return false;
  }
  return true;
}

/** Force a fresh detection (overlay Re-check button). Closes the overlay if the
 *  blocker is now off. Returns true when clear. */
export async function recheckAdblock(): Promise<boolean> {
  const blocked = await detectCached(true);
  setOverlay(blocked);
  return !blocked;
}

/** Hide the overlay (the next task-open re-shows it if still blocked). */
export function dismissAdblockOverlay(): void {
  setOverlay(false);
}

/** Warm the cache once on app load (no overlay side effect). */
export function warmAdblock(): void {
  void detectCached();
}
