"use client";

import Link from "next/link";
import { Rocket, ArrowRight } from "lucide-react";
import type { CtaContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";

type Props = Partial<CtaContent>;

export function CTA(props: Props) {
  const v: CtaContent = { ...DEFAULT_LANDING_CONTENT.cta, ...props };

  return (
    <section className="mk-section">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) px-5 py-8 sm:p-12 lg:p-16 text-center shadow-xl shadow-(--app-cta)/25">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-0 left-1/4 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
          </div>

          <div className="relative">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 border border-white/20 shadow-lg mb-6">
              <Rocket className="w-8 h-8 text-white" />
            </div>

            <h2 className="mk-h2 text-white mb-4">
              {v.heading_line1}{" "}
              <span className="bg-linear-to-r from-(--mk-rail-a) to-white bg-clip-text text-transparent">
                {v.heading_line2}
              </span>
            </h2>

            {/* White, not --mk-accent: the band IS the accent colour, so accent
                text on it was invisible in the light theme. */}
            <p className="text-base sm:text-lg text-white/85 mb-8 max-w-xl mx-auto text-pretty">
              {v.subheading}
            </p>

            <Link
              href={v.cta_href}
              className="mk-press inline-flex items-center gap-2 px-6 sm:px-8 py-4 whitespace-nowrap bg-white text-(--mk-accent) font-bold rounded-xl hover:bg-(--mk-accent-soft) shadow-lg"
            >
              {v.cta_label}
              <ArrowRight className="w-5 h-5" />
            </Link>

            <p className="text-sm text-white/75 mt-4">{v.disclaimer}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
