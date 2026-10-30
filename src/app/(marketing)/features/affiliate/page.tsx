import type { Metadata } from "next";
import Link from "next/link";
import {
  PageHero,
  Band,
  SectionHead,
  Facts,
  Rows,
  Steps,
  Tile,
  Btn,
  Faq,
  Closing,
} from "@/components/marketing/kit";
import { AffiliateMock } from "@/components/marketing/mocks";
import { COMPANY_NAME } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";

// Breadcrumb data comes from this route's layout.tsx.

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Affiliate Program — Earn Commission on Every Sale",
    description: `Share marketplace products and courses with your own link on ${COMPANY_NAME} and earn the commission the seller set on every sale, paid to your wallet.`,
    path: "/features/affiliate",
  });
}

const STEPS = [
  { title: "Apply", body: "Tell us where and how you'll promote. Approval unlocks your affiliate dashboard." },
  { title: "Grab a link", body: "Every eligible product and course gives you a personal link in one click." },
  { title: "Share it", body: "Your bio, a blog post, a video description or a group chat — wherever your audience is." },
  { title: "Earn per sale", body: "When someone buys through your link, the commission goes to your wallet." },
];

const WHY = [
  { title: "Seller-set rewards", body: "Each listing carries its own reward — a share of the sale or a fixed amount per order." },
  { title: "Clear tracking", body: "Clicks, sales and commissions for every link, in your affiliate dashboard." },
  { title: "No stock, no cost", body: "You never buy or hold anything. You share; the seller delivers." },
  { title: "Fair play", body: "Promote anywhere your audience already is. Spam isn't allowed and isn't paid." },
];

const FAQ = [
  {
    q: "How much commission do I earn?",
    a: "Each seller or tutor sets the reward for their listing — a percentage of the sale or a fixed amount. You see it before you take the link.",
  },
  {
    q: "Do I need an audience to apply?",
    a: "You need somewhere to share honestly — a social profile, a blog, a channel or a community. Tell us about it when you apply.",
  },
  {
    q: "When is a commission paid?",
    a: "When a sale through your link completes, the commission is added to your wallet and can be withdrawn under the usual withdrawal rules.",
  },
  {
    q: "What's the difference between affiliate and referral rewards?",
    a: "Affiliate commissions come from sales of specific products and courses you share. Referral rewards come from people you invite to join. You can earn both.",
  },
];

export default function AffiliateFeaturePage() {
  return (
    <>
      <PageHero
        kicker="Affiliate program"
        title="Share what's good."
        accent="Earn on every sale."
        lead="Promote marketplace products and courses with your own link. When someone buys through it, you earn the commission the seller set — paid to your wallet. No stock, no upfront cost."
        actions={
          <>
            <Btn href="/profile/become-creator">Apply as an affiliate</Btn>
            <Btn href="/register" variant="secondary">
              Create a free account
            </Btn>
          </>
        }
        note="Commission set per listing · Tracked per link"
        visual={<AffiliateMock />}
      />

      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <Facts
          items={[
            { value: "Per sale", label: "Commission on each order" },
            { value: "2", label: "Catalogs to promote" },
            { value: "Per link", label: "Clicks and sales tracked" },
            { value: "Wallet", label: "Where commissions land" },
          ]}
        />
      </div>

      <Band labelledBy="how-title">
        <SectionHead id="how-title" n="01" label="How it works" title="Four steps to your first commission" />
        <Steps items={STEPS} />
      </Band>

      <Band labelledBy="promote-title" alt>
        <SectionHead
          id="promote-title"
          n="02"
          label="What you can promote"
          title="Two catalogs, one commission stream"
          lead="Every listing shows its reward before you share it."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Tile
            href="/features/marketplace"
            cta="Explore the marketplace"
            title="Marketplace products & services"
            body="Templates, graphics, ebooks, stock media, tools and services from reviewed sellers."
          />
          <Tile
            href="/features/courses"
            cta="Explore courses"
            title="Online courses"
            body="Courses from approved tutors. Earn on every enrolment you send their way."
          />
        </div>
      </Band>

      <Band labelledBy="why-title">
        <SectionHead id="why-title" n="03" label="Why affiliates stay" title="Fair, clear and hands-off" />
        <Rows items={WHY} />
        <p className="mkx-body mt-8">
          Inviting friends instead? That&apos;s the{" "}
          <Link href="/referral" className="font-semibold text-(--mk-accent) underline-offset-4 hover:underline">
            referral program
          </Link>{" "}
          — and the two stack.
        </p>
      </Band>

      <Band labelledBy="faq-title" alt>
        <Faq id="faq-title" items={FAQ} />
      </Band>

      <div className="pt-[clamp(3.5rem,8vw,7rem)]">
        <Closing
          title="Ready to earn from what you share?"
          lead="Apply to the affiliate program and turn the recommendations you already make into commission."
          primary={{ href: "/profile/become-creator", label: "Apply as an affiliate" }}
          secondary={{ href: "/register", label: "Create a free account" }}
        />
      </div>
    </>
  );
}
