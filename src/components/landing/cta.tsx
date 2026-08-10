"use client";

import Link from "next/link";
import { Rocket, ArrowRight } from "lucide-react";
import type { CtaContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";

type Props = Partial<CtaContent>;

export function CTA(props: Props) {
  const v: CtaContent = { ...DEFAULT_LANDING_CONTENT.cta, ...props };

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-indigo-600 to-violet-600 p-8 sm:p-12 lg:p-16 text-center shadow-xl shadow-indigo-600/25">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-0 left-1/4 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
          </div>

          <div className="relative">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 border border-white/20 shadow-lg mb-6">
              <Rocket className="w-8 h-8 text-white" />
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-4">
              {v.heading_line1}{" "}
              <span className="bg-linear-to-r from-amber-200 to-white bg-clip-text text-transparent">
                {v.heading_line2}
              </span>
            </h2>

            <p className="text-lg text-indigo-100 mb-8 max-w-xl mx-auto">
              {v.subheading}
            </p>

            <Link
              href={v.cta_href}
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-indigo-700 font-bold rounded-xl hover:bg-indigo-50 transition-colors shadow-lg"
            >
              {v.cta_label}
              <ArrowRight className="w-5 h-5" />
            </Link>

            <p className="text-sm text-indigo-200 mt-4">{v.disclaimer}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
