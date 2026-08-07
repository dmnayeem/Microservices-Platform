"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { FooterContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";

type Props = Partial<FooterContent>;

export function Footer(props: Props) {
  const v: FooterContent = { ...DEFAULT_LANDING_CONTENT.footer, ...props };
  const currentYear = new Date().getFullYear();
  const copyright = v.copyright_notice.replace("{year}", String(currentYear));

  return (
    <footer className="border-t border-white/10 bg-slate-950/50 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-12">
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">EarnGPT</span>
            </Link>
            <p className="text-slate-400 mb-6 max-w-sm">{v.brand_description}</p>

            {v.payment_methods.length > 0 && (
              <div>
                <p className="text-sm text-slate-500 mb-3">
                  {v.payment_methods_label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {v.payment_methods.map((method, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300"
                    >
                      {method}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {v.link_groups.map((group, gi) => (
            <div key={gi}>
              <h4 className="font-semibold text-white mb-4">{group.title}</h4>
              <ul className="space-y-3">
                {group.links.map((link, li) => (
                  <li key={li}>
                    <Link
                      href={link.href}
                      className="text-slate-400 hover:text-white transition-colors text-sm"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <p>{copyright}</p>
            {/* Always-present legal links (required for app store + Google OAuth) */}
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms of Service
              </Link>
              <Link href="/refund" className="hover:text-white transition-colors">
                Refunds
              </Link>
            </nav>
            {v.tagline.trim() && <p>{v.tagline}</p>}
          </div>
        </div>
      </div>
    </footer>
  );
}
