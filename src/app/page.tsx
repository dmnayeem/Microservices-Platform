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
import { getLandingContent } from "@/lib/landing-content-server";

export default async function Home() {
  const content = await getLandingContent();

  return (
    <main className="relative min-h-screen bg-white text-slate-900 overflow-x-hidden">
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
