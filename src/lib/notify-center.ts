// Imperative, center-of-screen notification API for important events —
// celebratory rewards (bonus/gift/win/claim) and notable errors/successes that
// deserve more attention than a corner toast. Backed by a tiny module store
// (mirrors ./confirm.ts) so any async handler can call it without prop-drilling:
//
//   notifyCenter.reward({ amount: 500, unit: "pts", description: "Daily bonus" });
//   notifyCenter.error("Couldn't buy ticket", "This lottery has ended");
//
// A single <NotifyCenterHost /> mounted in the root layout renders the active
// notification, centered, with a tap/auto dismiss. Ordinary corner toasts keep
// using sonner.

import { runInterstitial } from "@/lib/reward-interstitial";

export type NotifyKind = "reward" | "success" | "error" | "warning" | "info";

export interface NotifyItem {
  id: number;
  kind: NotifyKind;
  title: string;
  description?: string;
  /** Reward amount (rendered big, e.g. +500 pts / +$5.00). */
  amount?: number;
  unit?: "pts" | "USD";
  /** How long before it auto-dismisses. */
  durationMs: number;
}

export interface RewardOptions {
  title?: string;
  description?: string;
  amount?: number;
  unit?: "pts" | "USD";
  durationMs?: number;
}

let queue: NotifyItem[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  for (const l of listeners) l();
}

export function subscribeNotify(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The active (front-of-queue) notification, or null. */
export function getNotifySnapshot(): NotifyItem | null {
  return queue[0] ?? null;
}

function push(item: Omit<NotifyItem, "id">): number {
  const id = ++counter;
  queue = [...queue, { ...item, id }];
  emit();
  return id;
}

/** Called by the host to dismiss a notification once it's shown out/tapped. */
export function dismissNotify(id: number) {
  queue = queue.filter((n) => n.id !== id);
  emit();
}

export const notifyCenter = {
  reward(opts: RewardOptions = {}) {
    // Gate the celebratory reward behind an interstitial ad (if one is
    // configured for REWARD_INTERSTITIAL); resolves instantly when there's no
    // ad / ad-free plan, so the popup shows immediately in that case.
    const show = () =>
      push({
        kind: "reward",
        title: opts.title ?? "Reward earned!",
        description: opts.description,
        amount: opts.amount,
        unit: opts.unit ?? "pts",
        durationMs: opts.durationMs ?? 3500,
      });
    void runInterstitial().then(show, show);
    return 0;
  },
  success(title: string, description?: string, durationMs = 3500) {
    return push({ kind: "success", title, description, durationMs });
  },
  error(title: string, description?: string, durationMs = 4500) {
    return push({ kind: "error", title, description, durationMs });
  },
  warning(title: string, description?: string, durationMs = 4000) {
    return push({ kind: "warning", title, description, durationMs });
  },
  info(title: string, description?: string, durationMs = 3500) {
    return push({ kind: "info", title, description, durationMs });
  },
};
