"use client";

import {
  UserPlus,
  ListTodo,
  Coins,
  Wallet,
  CheckCircle,
  Send,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { HowItWorksContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { SectionHeading } from "./section-heading";

const ICONS: Record<string, LucideIcon> = {
  UserPlus,
  ListTodo,
  Coins,
  Wallet,
  CheckCircle,
  Send,
  Sparkles,
};

type Props = Partial<HowItWorksContent>;

export function HowItWorks(props: Props) {
  const v: HowItWorksContent = {
    ...DEFAULT_LANDING_CONTENT.how_it_works,
    ...props,
  };

  return (
    <section id="how-it-works" className="mk-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={v.badge}
          line1={v.heading_line1}
          line2={v.heading_line2}
          sub={v.subheading}
        />

        <div className="relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-linear-to-r from-(--mk-grad-a)/30 via-(--mk-grad-b)/30 to-(--mk-grad-b)/30 hidden lg:block -translate-y-1/2 pointer-events-none" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 relative">
            {v.steps.map((step, i) => {
              const Icon = ICONS[step.iconKey] ?? Sparkles;
              return (
                <div
                  key={i}
                  className="mk-zoom mk-press relative p-6 pt-8 rounded-2xl mk-card text-center"
                >
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-full bg-linear-to-r ${step.gradient} text-white text-sm font-extrabold shadow-md`}
                    >
                      {step.step_number}
                    </span>
                  </div>

                  <div
                    className={`w-16 h-16 mx-auto mt-2 rounded-2xl bg-linear-to-br ${step.gradient} flex items-center justify-center mb-4 shadow-sm`}
                  >
                    <Icon className="w-8 h-8 text-white" />
                  </div>

                  <h3 className="text-lg font-bold text-(--mk-text) mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-(--mk-muted) leading-relaxed">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
