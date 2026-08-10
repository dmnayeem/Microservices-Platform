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

export default async function Home() {
  const content = await getLandingContent();
  const { theme, animations } = content.appearance;

  return (
    <main
      id="mk-root"
      data-mk-theme={theme}
      data-mk-anim={animations ? "on" : "off"}
      className="relative min-h-screen bg-(--mk-bg) text-(--mk-text) overflow-x-hidden"
    >
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
