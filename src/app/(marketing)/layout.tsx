import { Navbar, Footer } from "@/components/landing";
import {
  MarketingThemeScript,
  MarketingBlobs,
} from "@/components/landing/marketing-shell";
import { getLandingContent } from "@/lib/landing-content-server";
import { publicLanding, sectionOn } from "@/lib/landing-content";
import { AutoAds } from "@/components/providers/auto-ads";
import { getSeoSettings, sameAsList } from "@/lib/seo-settings";

// Shared chrome for public marketing pages (About, Careers, Blog, Press, Help,
// Contact, Status, and the /features/* pages) — the content-driven Navbar and
// Footer plus the marketing theme surface (data-mk-theme / --mk-* tokens), so
// every page reads as one consistent brand and flips light/dark with the
// visitor's landing toggle. Content is pushed below the fixed navbar.
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [content, seo] = await Promise.all([
    getLandingContent().then(publicLanding),
    getSeoSettings(),
  ]);
  const { theme, animations } = content.appearance;
  return (
    <main
      id="mk-root"
      data-mk-theme={theme}
      data-mk-anim={animations ? "on" : "off"}
      className="relative min-h-screen bg-(--mk-bg) text-(--mk-text) overflow-x-hidden"
    >
      <MarketingThemeScript allowToggle={content.appearance.themeToggle !== false} />
      {/* Auto ads on the public pages only — NEVER inside (main), where every
          screen is incentivised and Google ads are not permitted. */}
      <AutoAds />
      {animations && <MarketingBlobs />}
      <div className="relative z-10">
        {sectionOn(content, "navbar") && <Navbar {...content.navbar} themeToggle={content.appearance.themeToggle !== false} />}
        <div className={sectionOn(content, "navbar") ? "pt-16 lg:pt-20" : ""}>{children}</div>
        {sectionOn(content, "footer") && <Footer {...content.footer} socials={sameAsList(seo["seo.org_same_as"])} />}
      </div>
    </main>
  );
}
