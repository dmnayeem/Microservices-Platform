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

/** A quiet ruled strip — assurances, not a feature panel. */
export function TrustBadges(props: Props) {
  const v: TrustBadgesContent = {
    ...DEFAULT_LANDING_CONTENT.trust_badges,
    ...props,
  };

  return (
    <section className="py-[clamp(2rem,5vw,3.5rem)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-2 border-y border-(--mk-border) md:grid-cols-4">
          {v.items.map((b, i) => {
            const Icon = ICONS[b.iconKey] ?? Shield;
            return (
              <li
                key={i}
                className={[
                  "mkx-reveal flex min-w-0 items-center gap-3 py-5 pr-3 sm:py-6",
                  i % 2 === 1 ? "border-l border-(--mk-border) pl-4 sm:pl-6" : "",
                  i >= 2 ? "border-t border-(--mk-border) md:border-t-0" : "",
                  i === 2 ? "md:border-l md:pl-6" : "",
                ].join(" ")}
              >
                <Icon aria-hidden className="h-5 w-5 shrink-0 text-(--mk-accent)" />
                <span className="min-w-0 text-sm font-medium text-(--mk-text) text-balance">{b.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
