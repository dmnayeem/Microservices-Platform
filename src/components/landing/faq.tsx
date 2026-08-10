"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FaqContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";

type Props = Partial<FaqContent>;

export function FAQ(props: Props) {
  const v: FaqContent = { ...DEFAULT_LANDING_CONTENT.faq, ...props };
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 sm:py-28 bg-(--mk-band)">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-block px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-600 text-xs font-semibold uppercase tracking-wider mb-4">
            {v.badge}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-(--mk-text) tracking-tight mb-4">
            {v.heading_line1}{" "}
            <span className="bg-linear-to-r from-sky-600 to-indigo-600 bg-clip-text text-transparent">
              {v.heading_line2}
            </span>
          </h2>
          <p className="text-(--mk-muted) text-lg">{v.subheading}</p>
        </div>

        <div className="space-y-3">
          {v.items.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className={`rounded-2xl border bg-(--mk-surface) shadow-sm transition-colors ${
                  isOpen
                    ? "border-indigo-500/50"
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
                        ? "bg-indigo-500/15 text-indigo-600"
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
            className="text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
          >
            {v.contact_label}
          </a>
        </div>
      </div>
    </section>
  );
}
