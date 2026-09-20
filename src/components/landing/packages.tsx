"use client";

import {
  Check,
  Zap,
  Star,
  Sparkles,
  Crown,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { PackagesContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { SectionHeading } from "./section-heading";

const ICONS: Record<string, LucideIcon> = {
  Zap,
  Star,
  Sparkles,
  Crown,
  Trophy,
};

type Props = Partial<PackagesContent>;

export function Packages(props: Props) {
  const v: PackagesContent = { ...DEFAULT_LANDING_CONTENT.packages, ...props };

  return (
    <section id="pricing" className="mk-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={v.badge}
          line1={v.heading_line1}
          line2={v.heading_line2}
          sub={v.subheading}
        />

        <div className="mk-rise grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-8">
          {v.plans.map((pkg, i) => {
            const Icon = ICONS[pkg.iconKey] ?? Star;
            return (
              <div
                key={i}
                className={`mk-zoom relative rounded-2xl p-6 lg:p-8 ${
                  pkg.is_popular
                    ? "bg-linear-to-b from-(--mk-grad-a)/10 to-transparent border-2 border-(--mk-accent)/50 shadow-xl shadow-(--app-cta)/10 xl:scale-105"
                    : "mk-card hover:border-(--mk-border-strong)"
                }`}
              >
                {pkg.is_popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 rounded-full bg-violet-600 text-white text-xs font-bold uppercase shadow-sm">
                      Most Popular
                    </span>
                  </div>
                )}

                <div
                  className={`w-12 h-12 rounded-xl bg-linear-to-br ${pkg.gradient} flex items-center justify-center mb-4 shadow-sm`}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>

                <h3 className="text-xl font-bold text-(--mk-text) mb-1">{pkg.name}</h3>
                <p className="text-sm text-(--mk-subtle) mb-4">{pkg.description}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-extrabold text-(--mk-text)">{pkg.price}</span>
                  <span className="text-(--mk-subtle)">{pkg.period}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {pkg.features.map((feature, j) => (
                    <li
                      key={j}
                      className="flex items-start gap-3 text-sm text-(--mk-muted)"
                    >
                      <Check className="w-5 h-5 text-(--mk-success) shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={`block w-full py-3 text-center font-semibold rounded-xl transition-all ${
                    pkg.is_popular
                      ? "bg-linear-to-r from-(--mk-grad-a) to-(--mk-grad-b) text-white hover:from-(--mk-grad-a) hover:to-(--mk-grad-b)"
                      : "bg-(--mk-surface) text-(--mk-text) hover:bg-(--mk-surface-2) border border-(--mk-border-strong)"
                  }`}
                >
                  {pkg.cta_label}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-12">
          <p className="text-(--mk-subtle) text-sm">{v.guarantee_text}</p>
        </div>
      </div>
    </section>
  );
}
