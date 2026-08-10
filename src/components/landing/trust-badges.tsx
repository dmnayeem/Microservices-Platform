"use client";

import {
  Shield,
  Lock,
  Globe,
  Trophy,
  BadgeCheck,
  Headphones,
  type LucideIcon,
} from "lucide-react";
import type { TrustBadgesContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";

const ICONS: Record<string, LucideIcon> = {
  Shield,
  Lock,
  Globe,
  Trophy,
  BadgeCheck,
  Headphones,
};

type Props = Partial<TrustBadgesContent>;

export function TrustBadges(props: Props) {
  const v: TrustBadgesContent = {
    ...DEFAULT_LANDING_CONTENT.trust_badges,
    ...props,
  };

  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-(--mk-surface) border border-(--mk-border) shadow-sm p-6 sm:p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {v.items.map((b, i) => {
              const Icon = ICONS[b.iconKey] ?? Shield;
              return (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 text-center sm:text-left"
                >
                  <Icon className="w-7 h-7 text-indigo-600 shrink-0" />
                  <span className="text-(--mk-text) text-sm font-semibold">
                    {b.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
