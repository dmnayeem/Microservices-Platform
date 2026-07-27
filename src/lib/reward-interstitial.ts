// Imperative interstitial-ad gate. Any client handler can `await runInterstitial()`
// to show a full-screen ad (fetched by AdInterstitialOverlay) and continue only
// after it finishes. If no ad is configured for the placement (or the plan is
// ad-free) the overlay resolves instantly, so callers never block. Backed by a
// tiny module store (mirrors ./notify-center.ts + ./confirm.ts); a single
// <RewardInterstitialHost/> in the root layout renders the overlay.

import type { AdPlacementName } from "@/lib/ad-placements";

interface InterstitialState {
  open: boolean;
  placement: AdPlacementName;
  /** Bumps each time we (re)open, so the overlay effect re-runs on a repeat. */
  nonce: number;
}

let state: InterstitialState = {
  open: false,
  placement: "REWARD_INTERSTITIAL",
  nonce: 0,
};
let resolver: (() => void) | null = null;
// Serialize overlays so two rewards fired together show one at a time.
let chain: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeInterstitial(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable snapshot for useSyncExternalStore (only changes on set()). */
export function getInterstitialSnapshot(): InterstitialState {
  return state;
}

/** Server snapshot — always closed (no overlay during SSR). */
export function getInterstitialServerSnapshot(): InterstitialState {
  return CLOSED;
}
const CLOSED: InterstitialState = {
  open: false,
  placement: "REWARD_INTERSTITIAL",
  nonce: 0,
};

/**
 * Open the interstitial for `placement` and resolve when the user finishes it
 * (or immediately if there's no ad). Serialized so concurrent calls queue.
 */
export function runInterstitial(
  placement: AdPlacementName = "REWARD_INTERSTITIAL"
): Promise<void> {
  const run = () =>
    new Promise<void>((resolve) => {
      resolver = resolve;
      state = { open: true, placement, nonce: state.nonce + 1 };
      emit();
    });
  const p = chain.then(run);
  chain = p.catch(() => {});
  return p;
}

/** Called by the host when the overlay closes/completes. */
export function finishInterstitial() {
  const r = resolver;
  resolver = null;
  state = { ...state, open: false };
  emit();
  r?.();
}
