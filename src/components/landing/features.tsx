"use client";

import Link from "next/link";
import {
  Pin,
  Video,
  FileText,
  ClipboardList,
  Send,
  Users,
  Globe,
  Trophy,
  Sparkles,
  Gift,
  Wallet,
  Smartphone,
  ShoppingBag,
  GraduationCap,
  Handshake,
  Gamepad2,
  MessageSquare,
  Megaphone,
  Ticket,
  Brain,
  Flame,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import type { FeaturesContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { SectionHeading } from "./section-heading";

const ICONS: Record<string, LucideIcon> = {
  Pin,
  Video,
  FileText,
  ClipboardList,
  Send,
  Users,
  Globe,
  Trophy,
  Sparkles,
  Gift,
  Wallet,
  Smartphone,
  ShoppingBag,
  GraduationCap,
  Handshake,
  Gamepad2,
  MessageSquare,
  Megaphone,
  Ticket,
  Brain,
  Flame,
};

type Props = Partial<FeaturesContent>;

export function Features(props: Props) {
  const v: FeaturesContent = { ...DEFAULT_LANDING_CONTENT.features, ...props };

  return (
    <section id="features" className="mkx-band border-y border-(--mk-border) bg-(--mk-band)">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={v.badge}
          line1={v.heading_line1}
          line2={v.heading_line2}
          sub={v.subheading}
        />

        {/* One ruled grid instead of a card each: the cells share their
            borders, so the items read as one catalogue, not a row of adverts.
            Icons are a single ink — the per-item gradient tiles (the CMS
            `gradient` field) were the loudest "template" signal on the page. */}
        <div className="grid grid-cols-1 border-l border-t border-(--mk-border) sm:grid-cols-2 lg:grid-cols-3">
          {v.items.map((feature, i) => {
            const Icon = ICONS[feature.iconKey] ?? Sparkles;
            const href = feature.href?.trim();
            const cellClass =
              "mkx-cell mkx-reveal group relative flex h-full min-w-0 flex-col border-b border-r border-(--mk-border) p-6 sm:p-8";
            const inner = (
              <>
                <Icon aria-hidden className="h-5 w-5 text-(--mk-accent)" />
                <h3 className="mkx-h3 mt-5 text-balance">{feature.title}</h3>
                <p className="mkx-body mt-2 line-clamp-4">{feature.description}</p>
                {href && (
                  <span className="mkx-arrow mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-(--mk-accent)">
                    Learn more
                    <ArrowUpRight aria-hidden className="h-4 w-4" />
                  </span>
                )}
              </>
            );

            return href ? (
              <Link key={i} href={href} className={`${cellClass} mk-focus`}>
                {inner}
              </Link>
            ) : (
              <div key={i} className={cellClass}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
