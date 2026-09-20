"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, Sparkles } from "lucide-react";
import type { NavbarContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { ThemeToggle } from "./theme-toggle";
import { MarketingNavLink } from "./marketing-link";

type Props = Partial<NavbarContent>;

export function Navbar(props: Props) {
  const v: NavbarContent = { ...DEFAULT_LANDING_CONTENT.navbar, ...props };

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 backdrop-blur-xl border-b border-(--mk-border) ${
        isScrolled ? "bg-(--mk-nav-scrolled) shadow-sm" : "bg-(--mk-nav)"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) flex items-center justify-center shadow-sm shadow-(--app-cta)/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-linear-to-r from-(--mk-rail-a) to-(--mk-rail-b) bg-clip-text text-transparent">
              EarnGPT
            </span>
          </Link>

          {/* gap-4 until xl: the bar carries eight links now, and at exactly
              1024px the old gap-8 pushed the last one under the sign-up CTA. */}
          <nav className="hidden lg:flex items-center gap-4 xl:gap-8">
            {v.nav_links.map((link, i) => (
              <MarketingNavLink
                key={`${link.href}-${i}`}
                href={link.href}
                className="text-(--mk-muted) hover:text-(--mk-text) transition-colors text-sm font-medium"
              >
                {link.label}
              </MarketingNavLink>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <ThemeToggle />
            <Link
              href={v.cta_signin_href}
              className="text-(--mk-muted) hover:text-(--mk-text) transition-colors text-sm font-medium"
            >
              {v.cta_signin_label}
            </Link>
            <Link
              href={v.cta_signup_href}
              className="mk-press px-5 py-2.5 bg-linear-to-r from-(--mk-grad-a) to-(--mk-grad-b) text-white text-sm font-semibold rounded-xl shadow-sm shadow-(--app-cta)/20 hover:from-(--mk-grad-a) hover:to-(--mk-grad-b)"
            >
              {v.cta_signup_label}
            </Link>
          </div>

          {/* The sign-up CTA was behind the hamburger on every phone — the one
              action the page exists for took two taps and a scroll. It now sits
              in the bar itself from 400px up (hidden only on the very narrowest
              devices, where the wordmark + two controls already fill the row). */}
          <div className="lg:hidden flex items-center gap-1">
            <Link
              href={v.cta_signup_href}
              className="hidden min-[400px]:inline-flex items-center min-h-11 px-4 bg-linear-to-r from-(--mk-grad-a) to-(--mk-grad-b) text-white text-sm font-semibold rounded-xl shadow-sm shadow-(--app-cta)/20"
            >
              {v.cta_signup_label}
            </Link>
            <ThemeToggle />
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-(--mk-muted) hover:text-(--mk-text) hover:bg-(--mk-surface-2)"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        // A fixed bar with an auto-height panel under it can grow past the
        // viewport and strand the last links. Cap it at the space below the bar
        // and let it scroll.
        <div className="lg:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain bg-(--mk-nav-scrolled) backdrop-blur-xl border-t border-(--mk-border)">
          <div className="px-4 py-4 space-y-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {v.nav_links.map((link, i) => (
              <MarketingNavLink
                key={`${link.href}-${i}`}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="mk-press flex items-center min-h-11 px-2 -mx-2 rounded-xl font-medium text-(--mk-text) hover:bg-(--mk-surface-2) hover:text-(--mk-accent)"
              >
                {link.label}
              </MarketingNavLink>
            ))}
            <div className="pt-4 mt-3 space-y-3 border-t border-(--mk-border)">
              <Link
                href={v.cta_signin_href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="mk-press flex items-center justify-center w-full min-h-12 text-center text-(--mk-text) border border-(--mk-border-strong) rounded-xl hover:bg-(--mk-surface-2)"
              >
                {v.cta_signin_label}
              </Link>
              <Link
                href={v.cta_signup_href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="mk-press flex items-center justify-center w-full min-h-12 text-center bg-linear-to-r from-(--mk-grad-a) to-(--mk-grad-b) text-white font-semibold rounded-xl hover:from-(--mk-grad-a) hover:to-(--mk-grad-b)"
              >
                {v.cta_signup_label}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
