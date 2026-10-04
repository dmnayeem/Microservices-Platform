"use client";

import { BrandLockup, BrandMark } from "@/components/providers/brand";
import Link from "next/link";

import type { FooterContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { MarketingNavLink } from "./marketing-link";
import { BrandIcon } from "@/components/ui/brand-icon";
import { socialProfileOf } from "@/lib/seo/social-profiles";

type Props = Partial<FooterContent> & {
  /** Official social profiles (/admin/seo → seo.org_same_as). */
  socials?: string[];
};

export function Footer({ socials = [], ...props }: Props) {
  const v: FooterContent = { ...DEFAULT_LANDING_CONTENT.footer, ...props };
  const profiles = socials
    .map((url) => ({ url, p: socialProfileOf(url) }))
    .filter((x): x is { url: string; p: { key: string; label: string } } => !!x.p);
  const currentYear = new Date().getFullYear();
  const copyright = v.copyright_notice.replace("{year}", String(currentYear));

  return (
    <footer className="border-t border-(--mk-border) bg-(--mk-band)">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-12">
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 mb-4">
              <BrandLockup>
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) flex items-center justify-center shadow-sm shadow-(--app-cta)/20">
                  <BrandMark iconClassName="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-(--mk-text)">RevType</span>
              </BrandLockup>
            </Link>
            <p className="text-(--mk-muted) mb-6 max-w-sm leading-relaxed">
              {v.brand_description}
            </p>

            {/* The official profiles, with their real logos. rel="me" tells
                crawlers these accounts belong to this site. */}
            {profiles.length > 0 && (
              <ul className="flex flex-wrap gap-2 mb-6" aria-label="RevType on social media">
                {profiles.map(({ url, p }) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="me noopener noreferrer"
                      aria-label={`RevType on ${p.label}`}
                      title={`RevType on ${p.label}`}
                      className="grid place-items-center w-10 h-10 rounded-full bg-white shadow-sm ring-1 ring-black/5 hover:scale-105 transition-transform"
                    >
                      <BrandIcon brand={p.key} colored className="w-5 h-5" />
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {v.payment_methods.length > 0 && (
              <div>
                <p className="text-sm text-(--mk-subtle) mb-3">
                  {v.payment_methods_label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {v.payment_methods.map((method, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg mk-card text-sm text-(--mk-text) shadow-sm"
                    >
                      <BrandIcon brand={method} colored className="w-4 h-4" />
                      {method}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {v.link_groups.map((group, gi) => (
            <div key={gi}>
              <h4 className="font-semibold text-(--mk-text) mb-4">{group.title}</h4>
              <ul className="space-y-3">
                {group.links.map((link, li) => (
                  <li key={li}>
                    <MarketingNavLink
                      href={link.href}
                      className="text-(--mk-muted) hover:text-(--mk-text) transition-colors text-sm"
                    >
                      {link.label}
                    </MarketingNavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-(--mk-border)">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-(--mk-subtle)">
            <p>{copyright}</p>
            {/* Always-present legal links (required for app store + Google OAuth) */}
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <Link href="/privacy" className="hover:text-(--mk-text) transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-(--mk-text) transition-colors">
                Terms of Service
              </Link>
              <Link href="/refund" className="hover:text-(--mk-text) transition-colors">
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
