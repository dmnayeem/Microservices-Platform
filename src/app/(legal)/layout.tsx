import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { MarketingThemeScript } from "@/components/landing/marketing-shell";
import { getLandingContent } from "@/lib/landing-content-server";

// Privacy / Terms / Refunds. These used to be painted in a fixed dark gradient,
// which meant a visitor who had chosen the light landing hit a black wall the
// moment they opened Terms — and there was no way back to light from here.
// They now sit on the same #mk-root surface as the rest of the public site, so
// they follow the landing toggle. The chrome stays deliberately plainer than
// the marketing navbar: these are documents, not a pitch.
export default async function LegalLayout({ children }: { children: ReactNode }) {
  const content = await getLandingContent();
  return (
    <main
      id="mk-root"
      data-mk-theme={content.appearance.theme}
      className="min-h-screen bg-(--mk-bg) text-(--mk-muted)"
    >
      <MarketingThemeScript />
      <header className="border-b border-(--mk-border) bg-(--mk-nav) backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-lg font-bold text-(--mk-text)">EarnGPT</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-(--mk-muted) hover:text-(--mk-text) transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">{children}</div>

      <footer className="border-t border-(--mk-border)">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-(--mk-subtle)">
          <p>© {new Date().getFullYear()} EarnGPT. All rights reserved.</p>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/privacy" className="hover:text-(--mk-text) transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-(--mk-text) transition-colors">
              Terms
            </Link>
            <Link href="/refund" className="hover:text-(--mk-text) transition-colors">
              Refunds
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
