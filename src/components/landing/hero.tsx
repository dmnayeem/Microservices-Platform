"use client";

import Link from "next/link";
import {
  ArrowRight,
  Play,
  Users,
  DollarSign,
  CheckCircle,
  Star,
  Trophy,
  Sparkles,
  TrendingUp,
  Zap,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { HeroContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { HeroProduct } from "./hero-product";

const ICONS: Record<string, LucideIcon> = {
  Users,
  DollarSign,
  CheckCircle,
  Star,
  Trophy,
  Sparkles,
  TrendingUp,
  Zap,
};

type Props = Partial<HeroContent>;

/**
 * First viewport.
 *
 * It used to be a single centred column: badge, headline, sentence, two
 * buttons, then four statistic cards — the layout of a template, and one that
 * asks a stranger to take "earn money online" on trust. It now runs two
 * columns from `lg` up with the actual product beside the claim, and the
 * statistics move below the fold line as supporting evidence rather than as
 * the proof itself. Below `lg` the mock drops under the buttons, so the phone
 * order is: claim → action → product.
 */
export function Hero(props: Props) {
  const v: HeroContent = { ...DEFAULT_LANDING_CONTENT.hero, ...props };

  return (
    <section
      id="hero"
      className="relative pt-24 sm:pt-28 lg:pt-32 pb-16 sm:pb-20 lg:pb-24 overflow-hidden"
    >
      {/* Subtle fine grid, theme-aware and calm */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] [mask-image:radial-gradient(60%_50%_at_50%_0%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--mk-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--mk-grid) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid items-center gap-12 lg:gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          {/* ── Claim + action ── */}
          <div className="mk-in min-w-0 text-center lg:text-left max-w-2xl mx-auto lg:mx-0">
            <div className="mk-card inline-flex max-w-full items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full mb-6">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="min-w-0 truncate text-xs sm:text-sm text-(--mk-text) font-medium">
                {v.badge}
              </span>
            </div>

            <h1 className="mk-h1 mb-5 break-words">
              <span className="block text-(--mk-text)">{v.title_line1}</span>
              <span className="block bg-linear-to-r from-(--mk-rail-a) via-(--mk-rail-b) to-(--mk-rail-b) bg-clip-text text-transparent">
                {v.title_line2}
              </span>
            </h1>

            <p className="mk-lead mk-measure mx-auto lg:mx-0 mb-7 sm:mb-8">
              {v.subtitle}
            </p>

            {/* The primary action is visually first on every size. On mobile the
                two buttons stack full-width at 56px tall; `sm:` puts them side
                by side with the primary leading. */}
            <div className="flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3 mb-4">
              <Link
                href={v.cta_primary_href}
                className="mk-press w-full sm:w-auto min-h-14 px-8 py-4 bg-linear-to-r from-(--mk-grad-a) to-(--mk-grad-b) text-white font-semibold rounded-xl hover:from-(--mk-grad-a) hover:to-(--mk-grad-b) flex items-center justify-center gap-2 shadow-lg shadow-(--app-cta)/25"
              >
                {v.cta_primary_label}
                <ArrowRight className="w-5 h-5 shrink-0" />
              </Link>
              <a
                href={v.cta_secondary_href}
                className="mk-press w-full sm:w-auto min-h-14 px-8 py-4 bg-(--mk-surface) text-(--mk-text) font-semibold rounded-xl hover:bg-(--mk-surface-2) flex items-center justify-center gap-2 border border-(--mk-border-strong)"
              >
                <Play className="w-5 h-5 shrink-0 text-(--mk-accent)" />
                {v.cta_secondary_label}
              </a>
            </div>

            {/* Risk reversal belongs with the button it de-risks, not 64px below
                it. On a 360px screen the three claims wrap to their own lines
                rather than overflowing the viewport. */}
            <p className="inline-flex flex-wrap items-center lg:justify-start justify-center gap-x-2 gap-y-1 text-xs sm:text-sm text-(--mk-subtle)">
              <ShieldCheck className="w-4 h-4 shrink-0 text-(--mk-success)" />
              <span>No credit card required</span>
              <span aria-hidden>·</span>
              <span>Free to start</span>
              <span aria-hidden>·</span>
              <span>Withdraw anytime</span>
            </p>
          </div>

          {/* ── Proof: the product itself ── */}
          <div className="mk-in mk-in-2 min-w-0 lg:pl-4">
            <HeroProduct />
          </div>
        </div>

        {/* Supporting numbers. Below the two columns now, because a statistic
            is corroboration, not the argument. */}
        <div className="mk-in mk-in-3 mt-14 sm:mt-16 lg:mt-20 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {v.stats.map((stat, i) => {
            const Icon = ICONS[stat.iconKey] ?? Star;
            return (
              <div
                key={i}
                className="mk-card mk-press group min-w-0 rounded-2xl p-4 sm:p-5 hover:border-(--mk-border-strong)"
              >
                <Icon className="w-5 h-5 text-(--mk-accent) mx-auto mb-2.5" />
                <div className="mk-figure text-2xl sm:text-3xl text-(--mk-text)">
                  {stat.value}
                </div>
                <div className="text-xs sm:text-sm text-(--mk-subtle) mt-1 text-balance">
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
