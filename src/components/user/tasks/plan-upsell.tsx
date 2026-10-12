"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, X } from "lucide-react";

/**
 * "This task is for the Standard plan" — opened when a member taps a task above
 * their plan (lib/task-list.ts lists those as upgrade offers). Not a wall: the
 * free tasks around it stay open, and the sequential chain skips it.
 */

const EVENT = "eg:plan-upsell";

export type PlanLock = { name: string; slug: string };

export function openPlanUpsell(plan: PlanLock) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: plan }));
}

export function PlanUpsellModal() {
  const [plan, setPlan] = useState<PlanLock | null>(null);

  useEffect(() => {
    const open = (e: Event) => {
      const d = (e as CustomEvent<PlanLock>).detail;
      if (d?.name) setPlan(d);
    };
    window.addEventListener(EVENT, open);
    return () => window.removeEventListener(EVENT, open);
  }, []);

  if (!plan) return null;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4" onClick={() => setPlan(null)}>
      <div
        role="dialog"
        aria-modal="true"
        className="app-card w-full max-w-sm space-y-3 !p-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={() => setPlan(null)}
          className="app-tap float-right -mr-2 -mt-2 grid place-items-center text-(--app-ink-3) hover:text-(--app-ink)"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-amber-300">
          <Crown className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-black text-white">{plan.name} plan task</h2>
        <p className="text-sm text-(--app-ink-2)">
          Get the <b className="text-white">{plan.name}</b> plan to do this task and the other {plan.name} tasks —
          they pay more, so you earn more every day.
        </p>
        <p className="text-xs text-(--app-ink-3)">
          You don&apos;t have to: the free tasks around it are still open for you.
        </p>
        <Link
          href={`/packages?plan=${encodeURIComponent(plan.slug)}`}
          onClick={() => setPlan(null)}
          className="app-press flex min-h-11 w-full items-center justify-center gap-2 rounded-(--app-r-control) bg-amber-500 px-4 text-sm font-black text-black"
        >
          <Crown className="h-4 w-4" /> See the {plan.name} plan
        </Link>
        <button type="button" onClick={() => setPlan(null)} className="w-full text-xs font-semibold text-(--app-ink-2)">
          Not now
        </button>
      </div>
    </div>
  );
}
