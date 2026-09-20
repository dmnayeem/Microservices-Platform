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
    <section id="features" className="mk-section bg-(--mk-band)">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={v.badge}
          line1={v.heading_line1}
          line2={v.heading_line2}
          sub={v.subheading}
        />

        <div className="mk-rise grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {v.items.map((feature, i) => {
            const Icon = ICONS[feature.iconKey] ?? Sparkles;
            const href = feature.href?.trim();
            const cardClass =
              "mk-zoom mk-press group relative flex flex-col h-full p-6 rounded-2xl mk-card hover:border-(--mk-border-strong)";
            const inner = (
              <>
                <div
                  className={`w-14 h-14 rounded-2xl bg-linear-to-br ${feature.gradient} flex items-center justify-center mb-4 shadow-sm group-hover:scale-105 transition-transform`}
                >
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-(--mk-text) mb-2 flex items-center gap-1.5">
                  {feature.title}
                  {href && (
                    <ArrowUpRight className="w-4 h-4 text-(--mk-subtle) group-hover:text-(--mk-accent) transition-colors" />
                  )}
                </h3>
                <p className="text-sm text-(--mk-muted) leading-relaxed">
                  {feature.description}
                </p>
                {href && (
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-(--mk-accent)">
                    Learn more
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </>
            );

            return href ? (
              <Link key={i} href={href} className={cardClass}>
                {inner}
              </Link>
            ) : (
              <div key={i} className={cardClass}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
