import type { AdSlotInfo } from "@/components/user/primitives/ad-slot-shell";

/**
 * Browser half of real ad measurement (server half: src/lib/ad-measure.ts).
 *
 * Attached to every rendered ad through `AdSlotShell`. Per slot:
 *
 *  - **Viewable impression (IAB)** — ≥50% of the ad's pixels in the viewport
 *    (≥30% for creatives of ≥242,500 px²) for ≥1 continuous second while the
 *    page is visible. Window focus is not required. For AdSense / Ad Manager,
 *    only once the unit has actually FILLED — an unfilled unit is no
 *    impression, and the house ad that replaces it carries its own token.
 *    One beacon per serve token.
 *  - **Estimated click** — third-party iframes cannot report clicks, so: the
 *    window lost focus to an iframe inside this slot while the pointer was
 *    over it (on touch devices, while the slot was on screen). Reported as an
 *    estimate, never billed.
 *  - **Script execution** — PAGE_SCRIPT ads are not viewable units; the beacon
 *    says the script loaded on a visible page.
 *
 * Own / house ad clicks are not sent from here: they navigate through the
 * `/api/spaces/go` redirect (`adClickHref`), and the capture listener below
 * only appends the page signals to that link at the moment it is clicked.
 */

const BEACON_URL = "/api/spaces/m";
const LARGE_AD_PX = 242_500;

type SlotState = {
  info: AdSlotInfo;
  ratio: number;
  need: number;
  firstVisibleAt: number;
  overAt: number;
  sentView: boolean;
  sentEst: boolean;
  sentExec: boolean;
};

const states = new WeakMap<HTMLElement, SlotState>();
/** PAGE_SCRIPT slots, by ad id — `notifyAdScriptLoaded` finds them here. */
const scriptSlots = new Map<string, SlotState>();
/** Scripts that reported "loaded" before their slot's tracker attached. */
const pendingScripts = new Set<string>();
/** Live slots, for the window-blur (estimated click) check. */
const live = new Map<HTMLElement, SlotState>();

let activity = false;
let globalsInstalled = false;

function signals(trusted: boolean, st: SlotState | null) {
  const w = typeof window !== "undefined" ? window : null;
  return {
    wd: !!(typeof navigator !== "undefined" && (navigator as Navigator & { webdriver?: boolean }).webdriver),
    tr: trusted,
    act: activity,
    hid: typeof document !== "undefined" && document.visibilityState !== "visible",
    vp0: !w || w.innerWidth * w.innerHeight === 0,
    dv: st && st.firstVisibleAt > 0 ? Math.round(performance.now() - st.firstVisibleAt) : -1,
  };
}

function send(st: string, kind: "view" | "est_click" | "script_exec", sg: ReturnType<typeof signals>) {
  // text/plain: a CORS-safelisted type, which every browser lets sendBeacon send.
  const body = JSON.stringify({ st, kind, sg });
  try {
    if (navigator.sendBeacon?.(BEACON_URL, new Blob([body], { type: "text/plain;charset=UTF-8" }))) return;
  } catch {
    /* fall through */
  }
  try {
    void fetch(BEACON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    /* measurement must never break a page */
  }
}

/** Link target for an own / house ad: the click redirect, or the raw URL without a token. */
export function adClickHref(
  st: string | undefined,
  adId: string,
  url: string | null | undefined
): string | undefined {
  if (!url) return undefined;
  if (!st) return url;
  return `/api/spaces/go?st=${encodeURIComponent(st)}&a=${encodeURIComponent(adId)}`;
}

function isFilled(el: HTMLElement, network: string): boolean {
  if (network === "adsense") {
    const ins = el.querySelector("ins.adsbygoogle");
    if (!ins) return false;
    const s = ins.getAttribute("data-ad-status");
    if (s) return s === "filled";
    // Older tags never set data-ad-status; a rendered iframe is the fill.
    return !!ins.querySelector("iframe");
  }
  if (network === "gam") {
    const f = el.querySelector("iframe");
    return !!f && f.offsetWidth > 0 && f.offsetHeight > 0;
  }
  // Any other network's HTML frame reports whether it drew anything
  // (sandboxed-ad-frame.tsx). "pending" keeps the poll going; "0" is an empty
  // frame and never an impression. No marker = our own creative: filled.
  const host = el.querySelector("[data-ad-filled]");
  if (host) return host.getAttribute("data-ad-filled") === "1";
  return true;
}

function installGlobals() {
  if (globalsInstalled || typeof window === "undefined") return;
  globalsInstalled = true;
  const mark = (e: Event) => {
    if (e.isTrusted) activity = true;
  };
  for (const t of ["pointermove", "pointerdown", "touchstart", "wheel", "keydown"]) {
    window.addEventListener(t, mark, { capture: true, passive: true });
  }

  // Append the page signals to an ad click link at the moment it is used.
  const stamp = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.("a[href*='/api/spaces/go?']") as HTMLAnchorElement | null;
    if (!a) return;
    const shell = a.closest(".ad-slot-shell") as HTMLElement | null;
    const st = shell ? states.get(shell) ?? null : null;
    const s = signals(e.isTrusted, st);
    const sg = [s.wd, s.tr, s.act, s.hid, s.vp0].map((b) => (b ? "1" : "0")).join(".") + "." + s.dv;
    try {
      const u = new URL(a.href, window.location.href);
      u.searchParams.set("sg", sg);
      a.href = u.pathname + u.search;
    } catch {
      /* leave the link as it was */
    }
  };
  for (const t of ["pointerdown", "click", "auxclick"]) {
    window.addEventListener(t, stamp, { capture: true });
  }

  // Third-party iframe clicks: focus moves into the iframe.
  const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? true;
  window.addEventListener("blur", (e) => {
    const trusted = e.isTrusted;
    setTimeout(() => {
      const ae = document.activeElement;
      if (!ae || ae.tagName !== "IFRAME") return;
      for (const [el, st] of live) {
        if (st.sentEst || !el.contains(ae) || !st.info.st) continue;
        const hovered = st.overAt > 0 && performance.now() - st.overAt < 30_000;
        const onScreen = st.ratio >= st.need;
        if (finePointer ? !hovered : !onScreen) continue;
        st.sentEst = true;
        send(st.info.st, "est_click", signals(trusted, st));
      }
    }, 0);
  });
}

/** The tracker `AdSlotShell` registers. Returns its cleanup. */
export function measureAdSlot(el: HTMLElement, info: AdSlotInfo): (() => void) | void {
  if (typeof window === "undefined" || !info.st) return;
  installGlobals();
  const st: SlotState = {
    info,
    ratio: 0,
    need: 0.5,
    firstVisibleAt: 0,
    overAt: 0,
    sentView: false,
    sentEst: false,
    sentExec: false,
  };
  states.set(el, st);

  if (info.type === "PAGE_SCRIPT") {
    scriptSlots.set(info.adId, st);
    if (pendingScripts.delete(info.adId)) notifyAdScriptLoaded(info.adId);
    return () => {
      if (scriptSlots.get(info.adId) === st) scriptSlots.delete(info.adId);
      states.delete(el);
    };
  }

  live.set(el, st);
  const network = info.network;
  const thirdParty = network !== "own" || info.type === "HTML";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fillPoll: ReturnType<typeof setInterval> | null = null;
  let fillPollStarted = 0;

  const viewableNow = () =>
    st.ratio >= st.need && document.visibilityState === "visible" && isFilled(el, network);

  const stopFillPoll = () => {
    if (fillPoll) clearInterval(fillPoll);
    fillPoll = null;
  };

  const evaluate = () => {
    if (st.sentView) return;
    const inView = st.ratio >= st.need && document.visibilityState === "visible";
    if (inView && !isFilled(el, network)) {
      // Network unit still loading (or unfilled) — keep checking for a while.
      if (!fillPoll) {
        fillPollStarted = performance.now();
        fillPoll = setInterval(() => {
          if (performance.now() - fillPollStarted > 60_000) stopFillPoll();
          else if (isFilled(el, network)) {
            stopFillPoll();
            evaluate();
          }
        }, 500);
      }
    } else {
      stopFillPoll();
    }
    if (viewableNow()) {
      if (!st.firstVisibleAt) st.firstVisibleAt = performance.now();
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (st.sentView || !viewableNow()) return;
          st.sentView = true;
          send(info.st!, "view", signals(true, st));
        }, 1000);
      }
    } else if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const r = e.boundingClientRect;
        st.need = r.width * r.height >= LARGE_AD_PX ? 0.3 : 0.5;
        st.ratio = e.isIntersecting ? e.intersectionRatio : 0;
      }
      evaluate();
    },
    { threshold: [0, 0.25, 0.3, 0.45, 0.5, 0.75, 1] }
  );
  io.observe(el);
  document.addEventListener("visibilitychange", evaluate);

  const enter = () => {
    st.overAt = performance.now();
  };
  const leave = () => {
    st.overAt = 0;
  };
  if (thirdParty) {
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
  }

  return () => {
    io.disconnect();
    document.removeEventListener("visibilitychange", evaluate);
    if (timer) clearTimeout(timer);
    stopFillPoll();
    el.removeEventListener("pointerenter", enter);
    el.removeEventListener("pointerleave", leave);
    live.delete(el);
    states.delete(el);
  };
}

/**
 * A PAGE_SCRIPT ad's script has loaded. Counted once per serve token, and only
 * on a visible page — a script that loads in a background tab is counted when
 * the tab is first shown.
 */
export function notifyAdScriptLoaded(adId: string): void {
  if (typeof document === "undefined") return;
  const st = scriptSlots.get(adId);
  if (!st) {
    // Child effects run before the shell's — the tracker may not be attached yet.
    pendingScripts.add(adId);
    return;
  }
  if (st.sentExec || !st.info.st) return;
  const fire = () => {
    if (st.sentExec || document.visibilityState !== "visible") return false;
    st.sentExec = true;
    send(st.info.st!, "script_exec", signals(true, st));
    return true;
  };
  if (fire()) return;
  const onVis = () => {
    if (fire()) document.removeEventListener("visibilitychange", onVis);
  };
  document.addEventListener("visibilitychange", onVis);
}
