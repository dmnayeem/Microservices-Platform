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
import { JsonLd } from "@/components/seo/json-ld";
import type { Metadata } from "next";

// The landing content comes from a raw Prisma read, not a tracked `fetch`, so
// Next cannot infer whether this page is static or dynamic — it would either
// freeze at build time (admin edits never appearing) or re-render per request.
// One minute is short enough that a CMS edit shows up promptly and long enough
// that the public home page is not a database query per visitor.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "EarnGPT — Earn Money Online with Tasks, Videos, Surveys & Courses",
  description:
    "Earn real money online with EarnGPT: complete micro-tasks, watch videos, take surveys, sell in the marketplace, learn with courses, and earn from referrals & affiliates. Join free and cash out.",
  alternates: { canonical: "/" },
};

export default async function Home() {
  const content = await getLandingContent();
  const { theme, animations } = content.appearance;
  const faqItems = (content.faq?.items ?? []).filter(
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
        <Navbar {...content.navbar} />
        <Hero {...content.hero} />
        <Features {...content.features} />
        <HowItWorks {...content.how_it_works} />
        <EarningsCalculator {...content.calculator} />
        <Packages {...content.packages} />
        <Testimonials {...content.testimonials} />
        <TrustBadges {...content.trust_badges} />
        <FAQ {...content.faq} />
        <CTA {...content.cta} />
        <Footer {...content.footer} />
      </div>
    </main>
  );
}
