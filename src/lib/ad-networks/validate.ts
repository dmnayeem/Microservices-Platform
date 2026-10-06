import { resolveAdSize } from "../ad-sizes";
import {
  isInterstitialPlacement,
  placementLabel,
  placementSpec,
  type AdFitProblem,
} from "../ad-placements";
import { getAdNetwork } from "./registry";

/**
 * Save-time rules for HTML / network-snippet ads (admin create + edit).
 * Client-safe so the form can show the same messages before it submits.
 *
 *  - **A size is required.** An HTML ad with no size rendered in a 250px-tall
 *    frame whatever the snippet was, so a 728×90 unit sat in a mostly-empty box
 *    and a 300×600 one was cut in half. The frame is now laid out at exactly
 *    the declared size, so it has to be declared. Exceptions: a native widget
 *    (`Responsive (native widget)`), full-screen interstitials (they size
 *    themselves) and page scripts (no box at all).
 *  - **The network must be real, not Google, and offer this kind of unit.**
 *  - **A mobile variant needs its own size**, within the space's height cap.
 */
export function checkHtmlAd(args: {
  placementName: string;
  type?: string | null;
  size?: string | null;
  width?: number | null;
  height?: number | null;
  networkId?: string | null;
  mobileHtml?: string | null;
  mobileWidth?: number | null;
  mobileHeight?: number | null;
}): AdFitProblem[] {
  if (args.type !== "HTML") return [];
  const out: AdFitProblem[] = [];
  const where = placementLabel(args.placementName);
  const isPageScript = args.placementName === "PAGE_SCRIPT";
  const net = args.networkId ? getAdNetwork(args.networkId) : null;

  if (args.networkId) {
    if (!net) {
      out.push({ field: "type", message: `Unknown ad network "${args.networkId}".` });
    } else if (net.google) {
      out.push({
        field: "type",
        message: "AdSense / Ad Manager are set up as their own ad types (Ad Network → Google), not as pasted HTML.",
      });
    } else if (isPageScript && !net.kinds.includes("PAGE_SCRIPT")) {
      out.push({ field: "type", message: `${net.name} has no page-level script formats.` });
    } else if (!isPageScript && !net.kinds.some((k) => k === "BANNER_IFRAME" || k === "NATIVE_WIDGET")) {
      out.push({
        field: "type",
        message: `${net.name} only offers page-level formats (popunder, push…). Put it in the "${placementLabel("PAGE_SCRIPT")}" space.`,
      });
    }
  }

  if (isPageScript || isInterstitialPlacement(args.placementName)) return out;

  const nativeOk = (!net || net.kinds.includes("NATIVE_WIDGET")) && (args.size || "responsive") === "responsive";
  const dim = resolveAdSize(args.size, args.width, args.height);
  if (!dim && !(nativeOk && net)) {
    out.push({
      field: "size",
      message: `An HTML ad needs its size (e.g. 300×250, 728×90, 320×50) so the frame matches the unit. Pick a size${
        net?.kinds.includes("NATIVE_WIDGET") ? ", or \"Responsive\" for a native widget" : ""
      }.`,
    });
  }

  if (args.mobileHtml && args.mobileHtml.trim()) {
    const w = Number(args.mobileWidth);
    const h = Number(args.mobileHeight);
    const cap = placementSpec(args.placementName).maxHeightPx;
    if (!(w > 0) || !(h > 0)) {
      out.push({ field: "size", message: "The mobile version needs its own width and height." });
    } else if (h > cap) {
      out.push({ field: "height", message: `The mobile version is ${h}px tall; ${where} allows ${cap}px.` });
    } else if (w > 727) {
      out.push({ field: "size", message: "The mobile version is used below 728px wide, so it must be narrower than that." });
    }
  }
  return out;
}

/** Clamp an optional positive integer from a request body (null clears). */
export function optInt(v: unknown, max: number): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(max, n);
}
