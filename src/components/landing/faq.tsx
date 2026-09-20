"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FaqContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { SectionHeading } from "./section-heading";

type Props = Partial<FaqContent>;

export function FAQ(props: Props) {
  const v: FaqContent = { ...DEFAULT_LANDING_CONTENT.faq, ...props };
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="mk-section bg-(--mk-band)">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={v.badge}
          line1={v.heading_line1}
          line2={v.heading_line2}
          sub={v.subheading}
        />

        <div className="space-y-3">
          {v.items.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className={`rounded-2xl border bg-(--mk-surface) shadow-sm transition-colors ${
                  isOpen
                    ? "border-(--mk-accent)/50"
                    : "border-(--mk-border) hover:border-(--mk-border-strong)"
                }`}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span
                    className={`font-semibold pr-4 ${
                      isOpen ? "text-(--mk-text)" : "text-(--mk-muted)"
                    }`}
                  >
                    {faq.question}
                  </span>
                  <span
                    className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      isOpen
                        ? "bg-(--mk-accent)/15 text-(--mk-accent)"
                        : "bg-(--mk-surface-2) text-(--mk-subtle)"
                    }`}
                  >
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5">
                    <p className="text-(--mk-muted) leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="text-center mt-10">
          <p className="text-(--mk-subtle) mb-1">{v.contact_prompt}</p>
          <a
            href={`mailto:${v.contact_email}`}
            className="text-(--mk-accent) hover:text-(--mk-accent) font-semibold transition-colors"
          >
            {v.contact_label}
          </a>
        </div>
      </div>
    </section>
  );
}
