"use client";

import { useSyncExternalStore } from "react";
import { AdInterstitialOverlay } from "@/components/user/primitives/ad-interstitial-overlay";
import {
  subscribeInterstitial,
  getInterstitialSnapshot,
  getInterstitialServerSnapshot,
  finishInterstitial,
} from "@/lib/reward-interstitial";

/**
 * Single global host for the imperative reward/task interstitial gate. Renders
 * the full-screen ad overlay when `runInterstitial()` is called anywhere, and
 * resolves the caller's promise via `finishInterstitial` when it closes.
 */
export function RewardInterstitialHost() {
  const s = useSyncExternalStore(
    subscribeInterstitial,
    getInterstitialSnapshot,
    getInterstitialServerSnapshot
  );
  return (
    <AdInterstitialOverlay
      open={s.open}
      placement={s.placement}
      onDone={finishInterstitial}
    />
  );
}
