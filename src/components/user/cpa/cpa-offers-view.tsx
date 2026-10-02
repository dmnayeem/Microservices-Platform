"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Clock, Megaphone, RotateCcw, Star } from "lucide-react";
import { cpaWaitLabel } from "@/lib/cpa/retry";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { EmptyState, FilterChips, ListSkeleton } from "@/components/user/primitives";
import type { FilterChip } from "@/components/user/primitives";
import {
  CpaStatusChip,
  DifficultyChip,
  OfferLogo,
  PointsLabel,
  type CpaMine,
  type CpaOffer,
} from "./cpa-shared";
import { CpaHistoryList } from "./cpa-history-list";

type ListedOffer = CpaOffer & {
  available: boolean;
  reason: string | null;
  message: string | null;
  /** RETRY_LATER: when a rejected offer may be tried again. */
  retryAt: string | null;
  my: CpaMine | null;
};

type Tab = "available" | "mine";

export function CpaOffersView({
  pointsPerUsd,
  initialTab,
}: {
  pointsPerUsd: number;
  initialTab: Tab;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [offers, setOffers] = useState<ListedOffer[] | null>(null);
  const [category, setCategory] = useState("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cpa/offers", { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't load offers");
      setOffers(d.offers ?? []);
    } catch (e) {
      setOffers([]);
      toast.error("Couldn't load offers", {
        description: e instanceof Error ? e.message : "Try again",
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace(t === "mine" ? `${pathname}?tab=mine` : pathname, { scroll: false });
  };

  // The API already drops capped / not-for-you offers the user never touched,
  // so what is left is: offers the user can start, and offers they already
  // have a conversion on. The second group stays in the list, dimmed, with
  // its status — after the ones that can still be done.
  // A rejected offer whose retry wait is over can be done again, so it sits
  // with the open ones.
  const open = useMemo(
    () => (offers ?? []).filter((o) => o.available && (!o.my || o.my.status === "REJECTED")),
    [offers]
  );
  const done = useMemo(
    () => (offers ?? []).filter((o) => o.my && !(o.available && o.my.status === "REJECTED")),
    [offers]
  );
  const mineCount = done.length;
  const all = useMemo(() => [...open, ...done], [open, done]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const o of all) if (o.category) set.add(o.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [all]);

  const shown = category === "all" ? all : all.filter((o) => o.category === category);
  const chipOptions: FilterChip<string>[] = [
    { value: "all", label: "All", count: all.length },
    ...categories.map((c) => ({
      value: c,
      label: c,
      count: all.filter((o) => o.category === c).length,
    })),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-start gap-3">
        <span className="app-icon app-icon-lg app-icon-accent">
          <Megaphone className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="t-title text-white">CPA Offers</h1>
          <p className="t-body mt-1 text-(--app-ink-3)">
            Sign up or try a partner app, send a screenshot as proof, and earn points once it&apos;s approved.
          </p>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="CPA offers"
        className="grid grid-cols-2 gap-1 rounded-xl border border-(--app-line) bg-(--app-surface) p-1 sm:max-w-sm"
      >
        {(
          [
            { key: "available", label: "Available", count: offers ? open.length : null },
            { key: "mine", label: "My offers", count: offers ? mineCount : null },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "app-press inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-semibold transition-colors",
              tab === t.key ? "app-accent" : "text-(--app-ink-3) hover:text-(--app-ink)"
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] tabular-nums",
                  tab === t.key ? "bg-white/20 text-white" : "bg-(--app-surface-2) text-(--app-ink-3)"
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "available" ? (
        offers === null ? (
          <ListSkeleton />
        ) : all.length === 0 ? (
          <div className="app-card">
            <EmptyState
              icon={Megaphone}
              title="No offers for you right now"
              description="New partner offers are added often. Check back soon."
            />
          </div>
        ) : (
          <>
            {categories.length > 0 && (
              <FilterChips options={chipOptions} value={category} onChange={setCategory} />
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((o) => (
                <OfferCard key={o.id} offer={o} pointsPerUsd={pointsPerUsd} />
              ))}
            </div>
          </>
        )
      ) : (
        <CpaHistoryList />
      )}
    </div>
  );
}

function OfferCard({ offer: o, pointsPerUsd }: { offer: ListedOffer; pointsPerUsd: number }) {
  return (
    <Link
      href={`/cpa/${o.id}`}
      className={cn(
        "app-card app-press app-lift relative flex min-w-0 flex-col gap-3 overflow-hidden",
        o.featured && !o.my && "border-(--app-accent-edge)",
        o.my && !o.available && "opacity-70"
      )}
    >
      {o.featured && !o.my && (
        <span className="app-accent absolute right-0 top-0 inline-flex items-center gap-1 rounded-bl-xl rounded-tr-[inherit] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          <Star className="h-3 w-3" /> Featured
        </span>
      )}
      <div className="flex min-w-0 items-start gap-3">
        <OfferLogo src={o.logoUrl} alt={o.title} size={48} />
        <div className={cn("min-w-0 flex-1", o.featured && !o.my && "pr-16")}>
          <h3 className="t-card-title line-clamp-2 text-white">{o.title}</h3>
          <span className="app-chip mt-1 max-w-full truncate">{o.network}</span>
        </div>
      </div>
      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <PointsLabel points={o.points} pointsPerUsd={pointsPerUsd} />
        <div className="ml-auto flex items-center gap-1.5">
          {o.estMinutes != null && o.estMinutes > 0 && (
            <span className="app-chip whitespace-nowrap">
              <Clock className="h-3 w-3" /> {o.estMinutes} min
            </span>
          )}
          <DifficultyChip difficulty={o.difficulty} />
        </div>
      </div>
      {o.my && (
        <div className="flex items-center justify-between gap-2">
          {o.my.status === "REJECTED" && (o.available || o.retryAt) ? (
            <span className={cn("app-chip whitespace-nowrap", o.available ? "app-chip-in" : "app-chip-warn")}>
              {o.available ? (
                <>
                  <RotateCcw className="h-3 w-3" /> Try again
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3" /> Try again in {cpaWaitLabel(o.retryAt!)}
                </>
              )}
            </span>
          ) : (
            <CpaStatusChip status={o.my.status} heldUntil={o.my.heldUntil} />
          )}
          <ChevronRight className="h-4 w-4 text-(--app-ink-3)" />
        </div>
      )}
    </Link>
  );
}
