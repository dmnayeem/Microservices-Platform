import {
  Navbar,
  Hero,
  Features,
  HowItWorks,
  EarningsCalculator,
  Packages,
  Testimonials,
  TrustBadges,
  FAQ,
  CTA,
  Footer,
} from "@/components/landing";
import {
  MarketingThemeScript,
  MarketingBlobs,
} from "@/components/landing/marketing-shell";
import { getLandingContent } from "@/lib/landing-content-server";
import { publicLanding, sectionOn } from "@/lib/landing-content";
import { getSeoSettings } from "@/lib/seo-settings";
import { JsonLd } from "@/components/seo/json-ld";
import type { Metadata } from "next";

// The landing content comes from a raw Prisma read, not a tracked `fetch`, so
// Next cannot infer whether this page is static or dynamic — it would either
// freeze at build time (admin edits never appearing) or re-render per request.
// One minute is short enough that a CMS edit shows up promptly and long enough
// that the public home page is not a database query per visitor.
export const revalidate = 60;

// The home page's title and description are the site's own (/admin/seo) —
// they were hard-coded here, overriding whatever the settings said.
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSeoSettings();
  return {
    title: { absolute: s["seo.default_title"] },
    description: s["seo.description"],
    alternates: { canonical: "/" },
  };
}

export default async function Home() {
  // Hidden items dropped, switched-off sections skipped — set in the editor
  // without deleting anything.
  const content = publicLanding(await getLandingContent());
  const on = (k: Parameters<typeof sectionOn>[1]) => sectionOn(content, k);
  const { theme, animations } = content.appearance;
  const faqItems = (on("faq") ? content.faq?.items ?? [] : []).filter(
    (f: { question?: string; answer?: string }) => f.question && f.answer
  );

  return (
    <main
      id="mk-root"
      data-mk-theme={theme}
      data-mk-anim={animations ? "on" : "off"}
      className="relative min-h-screen bg-(--mk-bg) text-(--mk-text) overflow-x-hidden"
    >
      {/* FAQPage structured data — Featured-Snippet / AEO win. */}
      {faqItems.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqItems.map((f: { question: string; answer: string }) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          }}
        />
      )}
      <MarketingThemeScript />
      {animations && <MarketingBlobs />}

      <div className="relative z-10">
        {on("navbar") && <Navbar {...content.navbar} />}
        {on("hero") && <Hero {...content.hero} />}
        {on("features") && <Features {...content.features} />}
        {on("how_it_works") && <HowItWorks {...content.how_it_works} />}
        {on("calculator") && <EarningsCalculator {...content.calculator} />}
        {on("packages") && <Packages {...content.packages} />}
        {on("testimonials") && <Testimonials {...content.testimonials} />}
        {on("trust_badges") && <TrustBadges {...content.trust_badges} />}
        {on("faq") && <FAQ {...content.faq} />}
        {on("cta") && <CTA {...content.cta} />}
        {on("footer") && <Footer {...content.footer} />}
      </div>
    </main>
  );
}
