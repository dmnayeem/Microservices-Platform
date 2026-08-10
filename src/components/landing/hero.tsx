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

export function Hero(props: Props) {
  const v: HeroContent = { ...DEFAULT_LANDING_CONTENT.hero, ...props };

  return (
    <section id="hero" className="relative pt-28 pb-20 sm:pb-24 overflow-hidden">
      {/* Subtle fine grid, theme-aware and calm */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] [mask-image:radial-gradient(60%_50%_at_50%_0%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--mk-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--mk-grid) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-(--mk-surface) border border-(--mk-border) shadow-sm mb-8">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-sm text-(--mk-text) font-medium">{v.badge}</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.08] tracking-tight mb-6">
            <span className="block text-(--mk-text)">{v.title_line1}</span>
            <span className="block bg-linear-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
              {v.title_line2}
            </span>
          </h1>

          <p className="text-base sm:text-lg lg:text-xl text-(--mk-muted) max-w-xl sm:max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed text-balance">
            {v.subtitle}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link
              href={v.cta_primary_href}
              className="mk-zoom w-full sm:w-auto px-8 py-4 bg-linear-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl hover:from-indigo-500 hover:to-violet-500 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25"
            >
              {v.cta_primary_label}
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href={v.cta_secondary_href}
              className="w-full sm:w-auto px-8 py-4 bg-(--mk-surface) text-(--mk-text) font-semibold rounded-xl hover:bg-(--mk-surface-2) transition-colors flex items-center justify-center gap-2 border border-(--mk-border-strong)"
            >
              <Play className="w-5 h-5 text-indigo-600" />
              {v.cta_secondary_label}
            </a>
          </div>

          <p className="inline-flex items-center gap-2 text-sm text-(--mk-subtle) mb-16">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            No credit card required · Free to start · Withdraw anytime
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {v.stats.map((stat, i) => {
              const Icon = ICONS[stat.iconKey] ?? Star;
              return (
                <div
                  key={i}
                  className="mk-zoom group rounded-2xl bg-(--mk-surface) border border-(--mk-border) shadow-sm p-4 sm:p-5 hover:border-(--mk-border-strong)"
                >
                  <Icon className="w-6 h-6 text-indigo-600 mx-auto mb-2" />
                  <div className="text-2xl sm:text-3xl font-extrabold text-(--mk-text) tabular-nums">
                    {stat.value}
                  </div>
                  <div className="text-xs sm:text-sm text-(--mk-subtle) mt-1">
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
