"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CtaContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";

type Props = Partial<CtaContent>;

/**
 * The closing band — the same deep-green panel the feature pages end on
 * (`.mkx-closing`): statement left, action right. The rocket tile, the blurred
 * glows and the gradient-clipped second line were removed with the rest of the
 * template look.
 */
export function CTA(props: Props) {
  const v: CtaContent = { ...DEFAULT_LANDING_CONTENT.cta, ...props };

  return (
    <section className="mkx-band">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mkx-closing mkx-reveal relative overflow-hidden rounded-3xl px-6 py-12 sm:px-12 sm:py-16">
          <div className="relative grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <h2 className="mkx-h2 text-white!">
                {v.heading_line1}
                {v.heading_line2 ? <span className="text-white/60"> {v.heading_line2}</span> : null}
              </h2>
              {/* White, not --mk-accent: the band IS the accent colour. */}
              <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-white/75 text-pretty">
                {v.subheading}
              </p>
            </div>
            <div className="lg:col-span-5 lg:text-right">
              <Link
                href={v.cta_href}
                className="mk-press mkx-arrow inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white px-7 text-[0.9375rem] font-semibold text-[#05301f] hover:bg-white/90"
              >
                {v.cta_label}
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              {v.disclaimer ? <p className="mt-3 text-sm text-white/65">{v.disclaimer}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
