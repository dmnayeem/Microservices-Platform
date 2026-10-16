"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Megaphone, Wallet, AlertTriangle } from "lucide-react";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { AudienceBuilder } from "@/components/admin/ads/audience-builder";
import { toast } from "@/lib/toast";
import { cn, pts, usd } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { parseTargeting, COUNTRY_OPTIONS, type AdTargeting } from "@/lib/ad-targeting";
import {
  BOOST_EVENT_KINDS,
  boostEventPrice,
  type BoostEventKind,
  type BoostPricing,
} from "@/lib/boost/pricing";
import { refreshMyBoosts } from "./use-post-boost";

interface Quote {
  pricing: BoostPricing;
  rate: number;
  adPoints: number;
  adFundUsd: number;
  country: string | null;
}

/** Short names for the price card; BOOST_EVENT_LABEL carries the long form. */
const SHORT: Record<BoostEventKind, { one: string; many: string }> = {
  IMPRESSION: { one: "impression", many: "impressions" },
  VIEW: { one: "view", many: "views" },
  CLICK: { one: "click", many: "clicks" },
  LIKE: { one: "like", many: "likes" },
  COMMENT: { one: "comment", many: "comments" },
  SHARE: { one: "share", many: "shares" },
};

export interface BoostComposerInitial {
  targeting?: unknown;
  budgetPoints?: number;
  durationDays?: number;
  paidWith?: string;
}

/**
 * The member's boost composer: audience (the advertiser AudienceBuilder, with
 * its live reach estimate), budget in Ad Points, duration, which balance pays,
 * and a price card built from the admin's boost prices. The server re-checks
 * everything — this only helps the member choose.
 */
export function BoostComposer({
  open,
  onOpenChange,
  postId,
  initial,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  /** Pre-fill from a rejected boost ("Edit & resubmit"). */
  initial?: BoostComposerInitial | null;
  onCreated?: (status: string) => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [targeting, setTargeting] = useState<AdTargeting>(() => parseTargeting(initial?.targeting));
  const [budget, setBudget] = useState<string>(initial?.budgetPoints ? String(initial.budgetPoints) : "");
  const [days, setDays] = useState<string>(String(initial?.durationDays ?? 7));
  const [payFrom, setPayFrom] = useState<"AD_POINTS" | "AD_FUND">(
    initial?.paidWith === "AD_FUND" ? "AD_FUND" : "AD_POINTS"
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/boosts/quote", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) {
          setQuoteError(d.error ?? "Could not load boost prices.");
          return;
        }
        const q = d as Quote;
        setQuote(q);
        setBudget((b) => b || String(q.pricing.minBudget));
        setDays((v) => String(Math.min(Math.max(1, Number(v) || 1), q.pricing.maxDays)));
        // Default to whichever balance can actually pay the minimum.
        if (!initial?.paidWith && q.adPoints < q.pricing.minBudget && q.adFundUsd * q.rate >= q.pricing.minBudget) {
          setPayFrom("AD_FUND");
        }
      })
      .catch(() => alive && setQuoteError("Could not load boost prices."));
    return () => {
      alive = false;
    };
  }, [open, initial?.paidWith]);

  const budgetN = Math.floor(Number(budget) || 0);
  const daysN = Math.floor(Number(days) || 0);
  const p = quote?.pricing;
  // Prices follow the VIEWER's country; the first country the member targets
  // is the best guess for who will see it, else the default prices.
  const priceCountry = targeting.countries?.[0] ?? null;
  const countryName = priceCountry ? COUNTRY_OPTIONS.find((c) => c.code === priceCountry)?.name ?? priceCountry : null;
  const prices = useMemo(
    () =>
      p
        ? BOOST_EVENT_KINDS.map((k) => ({ kind: k, price: boostEventPrice(p, k, priceCountry) })).filter(
            (x): x is { kind: BoostEventKind; price: number } => x.price !== null
          )
        : [],
    [p, priceCountry]
  );

  const fundAsPoints = quote ? Math.floor(quote.adFundUsd * quote.rate) : 0;
  const available = payFrom === "AD_POINTS" ? quote?.adPoints ?? 0 : fundAsPoints;
  const short = !!quote && budgetN > available;
  const budgetErr = p && budgetN < p.minBudget ? `The smallest budget is ${pts(p.minBudget)} Ad Points.` : null;
  const daysErr = p && !(daysN >= 1 && daysN <= p.maxDays) ? `Choose 1 to ${p.maxDays} days.` : null;
  const canSubmit = !!quote && !budgetErr && !daysErr && !short && !busy;

  // Rough reach the budget buys if all of it went on one kind of event.
  const estimate = (kind: BoostEventKind) => {
    const x = prices.find((e) => e.kind === kind);
    if (!x) return null;
    return x.price > 0 ? Math.floor(budgetN / x.price) : null;
  };
  const estViews = estimate("VIEW");
  const estClicks = estimate("CLICK");

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await fetch("/api/boosts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({
          postId,
          budgetPoints: budgetN,
          durationDays: daysN,
          payFrom,
          targeting: parseTargeting(targeting),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (d.status === "ACTIVE") {
        toast.success("Live now", { description: "Your boost is running. Track it under My boosts." });
      } else {
        toast.success("Sent for review — you'll be notified", {
          description: "Your budget is held until an admin reviews the boost.",
        });
      }
      refreshMyBoosts();
      onCreated?.(String(d.status ?? "PENDING"));
      onOpenChange(false);
    } catch (err) {
      toast.error("Boost failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  }

  const dayChips = p ? [1, 3, 7, 14, 30].filter((d) => d <= p.maxDays) : [];

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Boost this post"
      description="Show your post to more people. You pay only for what is counted, and anything unspent comes back."
      footer={
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="app-press flex-1 py-2.5 rounded-lg bg-(--app-surface-2) text-(--app-ink) text-sm font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={submit}
            className="app-press flex-1 py-2.5 rounded-lg bg-(--app-cta) text-(--app-on-cta) text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Megaphone className="w-4 h-4" />
                {budgetN > 0 ? `Boost for ${pts(budgetN)} Ad Points` : "Boost"}
              </>
            )}
          </button>
        </div>
      }
    >
      {quoteError ? (
        <p className="flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {quoteError}
        </p>
      ) : !quote || !p ? (
        <div className="py-10 grid place-items-center">
          <Loader2 className="w-6 h-6 animate-spin text-(--app-accent-ink)" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Audience — the same builder advertisers use, live reach included. */}
          <section className="rounded-lg border border-(--app-line) p-3 space-y-2.5">
            <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold">Audience</p>
            <p className="text-xs text-(--app-ink-3)">Leave everything empty to reach everyone.</p>
            <AudienceBuilder value={targeting} onChange={setTargeting} />
          </section>

          {/* Budget + duration */}
          <section className="rounded-lg border border-(--app-line) p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold">Budget and duration</p>
            <label className="block">
              <span className="text-xs font-semibold text-(--app-ink-2)">Total budget (Ad Points)</span>
              <input
                type="number"
                inputMode="numeric"
                min={p.minBudget}
                step={1}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="mt-1 w-full rounded-lg border border-(--app-line) bg-(--app-surface-2) px-3 py-2 text-sm text-(--app-ink) tabular-nums"
              />
              <span className={cn("mt-1 block text-[11px]", budgetErr ? "text-rose-300" : "text-(--app-ink-3)")}>
                {budgetErr ?? `Minimum ${pts(p.minBudget)} Ad Points.`}
              </span>
            </label>
            <div>
              <span className="text-xs font-semibold text-(--app-ink-2)">Run for (days)</span>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {dayChips.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(String(d))}
                    className={cn(
                      "app-press rounded-(--app-r-chip) border px-3 py-1.5 text-xs font-semibold",
                      daysN === d
                        ? "border-(--app-accent-edge) bg-(--app-cta)/10 text-(--app-ink)"
                        : "border-(--app-line) text-(--app-ink-3)"
                    )}
                  >
                    {d} {d === 1 ? "day" : "days"}
                  </button>
                ))}
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={p.maxDays}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  aria-label="Number of days"
                  className="w-20 rounded-lg border border-(--app-line) bg-(--app-surface-2) px-2 py-1.5 text-sm text-(--app-ink) tabular-nums"
                />
              </div>
              <span className={cn("mt-1 block text-[11px]", daysErr ? "text-rose-300" : "text-(--app-ink-3)")}>
                {daysErr ??
                  (budgetN > 0 && daysN > 0
                    ? `About ${pts(Math.floor(budgetN / daysN))} Ad Points a day. Up to ${p.maxDays} days.`
                    : `Up to ${p.maxDays} days.`)}
              </span>
            </div>
          </section>

          {/* Pay with */}
          <section className="rounded-lg border border-(--app-line) p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold">Pay with</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: "AD_POINTS", label: "Ad Points", value: `${pts(quote.adPoints)} pts` },
                  {
                    key: "AD_FUND",
                    label: "Ad Fund",
                    value: `${usd(quote.adFundUsd)} ≈ ${pts(fundAsPoints)} pts`,
                  },
                ] as const
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setPayFrom(o.key)}
                  className={cn(
                    "app-press text-left rounded-lg border p-2.5",
                    payFrom === o.key
                      ? "border-(--app-accent-edge) bg-(--app-cta)/10"
                      : "border-(--app-line) bg-(--app-surface-2)/50"
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold text-(--app-ink)">
                    <Wallet className="w-3.5 h-3.5" /> {o.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-(--app-ink-3) tabular-nums">{o.value}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-(--app-ink-3)">
              1 USD = {pts(quote.rate)} Ad Points. The whole budget is held now; unspent points return to the same
              balance when the boost ends.
            </p>
            {short && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/25 bg-amber-500/10 p-2.5 text-[11px] text-amber-100/90">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Not enough {payFrom === "AD_POINTS" ? "Ad Points" : "Ad Fund"} for this budget.
                <Link href="/deposit" className="font-bold underline underline-offset-2">
                  Add fund
                </Link>
                {payFrom === "AD_POINTS" && (
                  <Link href="/wallet" className="font-bold underline underline-offset-2">
                    Get Ad Points
                  </Link>
                )}
              </p>
            )}
          </section>

          {/* Price card */}
          <section className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-sky-300 font-bold">
              What you pay for{countryName ? ` — viewers in ${countryName}` : ""}
            </p>
            {prices.length === 0 ? (
              <p className="text-xs text-(--app-ink-3)">Nothing is charged right now.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                {prices.map((x) => (
                  <li key={x.kind} className="flex items-center justify-between text-xs text-(--app-ink-2)">
                    <span className="capitalize">{SHORT[x.kind].one}</span>
                    <b className="text-(--app-ink) tabular-nums">
                      {x.price === 0 ? "free" : `${pts(x.price)} pts`}
                    </b>
                  </li>
                ))}
              </ul>
            )}
            {budgetN > 0 && (estViews !== null || estClicks !== null) && (
              <p className="text-xs text-(--app-ink-2)">
                Roughly{" "}
                {estViews !== null && (
                  <b className="text-(--app-ink)">about {pts(estViews)} views</b>
                )}
                {estViews !== null && estClicks !== null && " or "}
                {estClicks !== null && (
                  <b className="text-(--app-ink)">about {pts(estClicks)} clicks</b>
                )}{" "}
                if the whole budget went on one of them. Each person counts once, and you are never charged for
                your own activity.
              </p>
            )}
            {priceCountry && (
              <p className="text-[11px] text-(--app-ink-3)">
                Prices follow each viewer&apos;s country; viewers elsewhere may cost more or less.
              </p>
            )}
            {p.requireReview && (
              <p className="text-[11px] text-(--app-ink-3)">Every boost is reviewed before it starts.</p>
            )}
          </section>
        </div>
      )}
    </BottomSheet>
  );
}
