"use client";

import { useState } from "react";
import type { FaqContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { SectionHeading } from "./section-heading";

type Props = Partial<FaqContent>;

/**
 * Heading and contact line on the left, the questions as a ruled list on the
 * right — the same shape as the feature pages' FAQ. The first answer starts
 * open; every answer stays in the HTML (see below).
 */
export function FAQ(props: Props) {
  const v: FaqContent = { ...DEFAULT_LANDING_CONTENT.faq, ...props };
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="mkx-band border-y border-(--mk-border) bg-(--mk-band)">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-4">
          <SectionHeading
            align="stack"
            eyebrow={v.badge}
            line1={v.heading_line1}
            line2={v.heading_line2}
            sub={v.subheading}
          />
          <p className="mkx-body -mt-4 lg:-mt-6">
            {v.contact_prompt}{" "}
            <a
              href={`mailto:${v.contact_email}`}
              className="font-semibold text-(--mk-accent) underline-offset-4 hover:underline"
            >
              {v.contact_label}
            </a>
          </p>
        </div>

        <div className="border-t border-(--mk-border) lg:col-span-8">
          {v.items.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={i} className="border-b border-(--mk-border)">
                {/* Each question is an h3 under the section's h2. */}
                <h3 className="m-0 text-base font-normal">
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="mk-focus flex w-full items-start justify-between gap-6 py-5 text-left"
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`}
                  >
                    <span className={`mkx-h3 ${isOpen ? "" : "text-(--mk-muted)!"}`}>{faq.question}</span>
                    <span
                      aria-hidden
                      className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-transform duration-300 ${
                        isOpen
                          ? "rotate-45 border-(--mk-accent) text-(--mk-accent)"
                          : "border-(--mk-border-strong) text-(--mk-subtle)"
                      }`}
                    >
                      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M6 1v10M1 6h10" />
                      </svg>
                    </span>
                  </button>
                </h3>
                {/* Always in the HTML, only hidden when closed: a crawler (and
                    the FAQPage markup's "visible on the page" rule) sees every
                    answer, not just the first one. */}
                <div id={`faq-a-${i}`} hidden={!isOpen} className="pb-6 pr-10">
                  <p className="mkx-body max-w-2xl">{faq.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
