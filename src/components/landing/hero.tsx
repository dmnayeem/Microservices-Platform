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
      className="relative pt-24 sm:pt-28 lg:pt-32 pb-2 sm:pb-4 overflow-hidden"
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
        <div className="grid items-center gap-12 lg:gap-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          {/* ── Claim + action ── */}
          <div className="mk-in min-w-0 max-w-3xl">
            {/* A ruled kicker, not a pill with a pinging dot. */}
            <p className="mkx-kicker mb-8 max-w-full">
              <span className="min-w-0 truncate">{v.badge}</span>
            </p>

            <h1 className="mkx-display mb-8 break-words lg:text-[clamp(2.25rem,3.4vw,3.375rem)]">
              <span className="block text-(--mk-text)">{v.title_line1}</span>
              <span className="block text-(--mk-subtle)">{v.title_line2}</span>
            </h1>

            <p className="mkx-lead mk-measure mb-10 line-clamp-4 sm:line-clamp-none">
              {v.subtitle}
            </p>

            {/* The primary action is visually first on every size. On mobile the
                two buttons stack full-width at 56px tall; `sm:` puts them side
                by side with the primary leading. */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-7">
              <Link
                href={v.cta_primary_href}
                className="mk-press mkx-arrow w-full sm:w-auto h-12 px-7 bg-(--mk-cta) text-(--mk-on-cta) font-semibold rounded-full hover:brightness-110 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {v.cta_primary_label}
                <ArrowRight aria-hidden className="w-4 h-4 shrink-0" />
              </Link>
              <a
                href={v.cta_secondary_href}
                className="mk-press w-full sm:w-auto h-12 px-7 bg-(--mk-surface) text-(--mk-text) font-semibold rounded-full hover:border-(--mk-text)/40 flex items-center justify-center gap-2 whitespace-nowrap border border-(--mk-border-strong)"
              >
                <Play aria-hidden className="w-4 h-4 shrink-0 text-(--mk-accent)" />
                {v.cta_secondary_label}
              </a>
            </div>

            {/* Risk reversal belongs with the button it de-risks, not 64px below
                it. On a 360px screen the three claims wrap to their own lines
                rather than overflowing the viewport. */}
            <p className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm tracking-[0.01em] text-(--mk-subtle)">
              <ShieldCheck className="w-4 h-4 shrink-0 text-(--mk-success)" />
              <span>No credit card required</span>
              <span aria-hidden>·</span>
              <span>Free to start</span>
              <span aria-hidden>·</span>
              <span>Pay shown before you start</span>
            </p>
          </div>

          {/* ── Proof: the product itself ── */}
          <div className="mk-in mk-in-2 min-w-0 lg:pl-4">
            <HeroProduct animation={v.animation} />
          </div>
        </div>

        {/* Supporting numbers, below the two columns because a statistic is
            corroboration, not the argument. One ruled row (the feature pages'
            "Facts" strip) rather than four icon cards. */}
        <dl className="mk-in mk-in-3 mt-14 sm:mt-16 lg:mt-20 grid grid-cols-2 border-y border-(--mk-border) md:grid-cols-4">
          {v.stats.map((stat, i) => {
            const Icon = ICONS[stat.iconKey] ?? Star;
            return (
              <div
                key={i}
                className={[
                  "flex min-w-0 flex-col gap-2 py-6 sm:py-8",
                  i % 2 === 1 ? "border-l border-(--mk-border) pl-4 sm:pl-6" : "pr-4",
                  i >= 2 ? "border-t border-(--mk-border) md:border-t-0" : "",
                  i === 2 ? "md:border-l md:pl-6" : "",
                ].join(" ")}
              >
                <dt className="flex items-start gap-2 text-sm text-(--mk-subtle)">
                  <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-(--mk-accent)" />
                  <span className="min-w-0 line-clamp-2">{stat.label}</span>
                </dt>
                <dd className="mkx-figure order-first max-w-full truncate">{stat.value}</dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
