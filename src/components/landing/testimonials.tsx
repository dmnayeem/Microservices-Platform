"use client";

import { Star, BadgeCheck, Quote } from "lucide-react";
import type { TestimonialsContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { SectionHeading } from "./section-heading";

type Props = Partial<TestimonialsContent>;

export function Testimonials(props: Props) {
  const v: TestimonialsContent = {
    ...DEFAULT_LANDING_CONTENT.testimonials,
    ...props,
  };

  return (
    <section id="testimonials" className="mk-section bg-(--mk-band)">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={v.badge}
          line1={v.heading_line1}
          line2={v.heading_line2}
          sub={v.subheading}
        />

        <div className="mk-rise grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Landing shows at most 6 reviews (2 rows of 3); the rest stay hidden. */}
          {v.items.slice(0, 6).map((t, i) => (
            <div
              key={i}
              className="mk-zoom relative p-6 rounded-2xl mk-card hover:border-(--mk-border-strong)"
            >
              <Quote className="absolute top-4 right-4 w-8 h-8 text-(--mk-quote)" />

              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-12 h-12 rounded-full bg-linear-to-br ${t.gradient} flex items-center justify-center text-white font-bold text-base shadow-sm`}
                >
                  {t.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <h4 className="font-semibold text-(--mk-text)">{t.name}</h4>
                    <BadgeCheck className="w-4 h-4 text-(--mk-accent)" />
                  </div>
                  <p className="text-xs text-(--mk-subtle)">
                    {t.country} ·{" "}
                    <span className="text-(--mk-success) font-bold">
                      {t.earned} earned
                    </span>
                  </p>
                </div>
              </div>

              <p className="text-(--mk-muted) leading-relaxed text-sm mb-4">
                &quot;{t.quote}&quot;
              </p>

              <div className="flex items-center gap-0.5">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star
                    key={j}
                    className="w-4 h-4 fill-amber-400 text-amber-400"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
