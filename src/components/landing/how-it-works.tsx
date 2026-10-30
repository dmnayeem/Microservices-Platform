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

/** Steps on a rail (marketing kit `.mkx-step`), the same as the feature pages. */
export function HowItWorks(props: Props) {
  const v: HowItWorksContent = {
    ...DEFAULT_LANDING_CONTENT.how_it_works,
    ...props,
  };

  return (
    <section id="how-it-works" className="mkx-band">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={v.badge}
          line1={v.heading_line1}
          line2={v.heading_line2}
          sub={v.subheading}
        />

        <ol className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {v.steps.map((step, i) => {
            const Icon = ICONS[step.iconKey] ?? Sparkles;
            return (
              <li key={i} className="mkx-step mkx-reveal min-w-0">
                <div className="flex items-center justify-between">
                  <span className="mkx-num">Step {step.step_number || i + 1}</span>
                  <Icon aria-hidden className="h-5 w-5 text-(--mk-subtle)" />
                </div>
                <h3 className="mkx-h3 mt-4 text-balance">{step.title}</h3>
                <p className="mkx-body mt-2 line-clamp-4">{step.description}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
