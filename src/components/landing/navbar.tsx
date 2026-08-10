"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, Sparkles } from "lucide-react";
import type { NavbarContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";

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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 backdrop-blur-xl border-b ${
        isScrolled
          ? "bg-white/95 shadow-sm border-slate-200"
          : "bg-white/70 border-slate-200/70"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-600/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-linear-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              EarnGPT
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-8">
            {v.nav_links.map((link, i) => (
              <a
                key={`${link.href}-${i}`}
                href={link.href}
                className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-4">
            <Link
              href={v.cta_signin_href}
              className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
            >
              {v.cta_signin_label}
            </Link>
            <Link
              href={v.cta_signup_href}
              className="px-5 py-2.5 bg-linear-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-600/20 hover:from-indigo-500 hover:to-violet-500 transition-colors"
            >
              {v.cta_signup_label}
            </Link>
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 text-slate-600 hover:text-slate-900"
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="lg:hidden bg-white/95 backdrop-blur-xl border-t border-slate-200">
          <div className="px-4 py-4 space-y-3">
            {v.nav_links.map((link, i) => (
              <a
                key={`${link.href}-${i}`}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-2 text-slate-700 hover:text-slate-900 transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-4 space-y-3 border-t border-slate-200">
              <Link
                href={v.cta_signin_href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full py-2.5 text-center text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
              >
                {v.cta_signin_label}
              </Link>
              <Link
                href={v.cta_signup_href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full py-2.5 text-center bg-linear-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl hover:from-indigo-500 hover:to-violet-500 transition-colors"
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
