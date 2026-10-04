import { OFFICIAL_SOCIAL_PROFILES } from "@/lib/seo/social-profiles";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  ShieldCheck,
  HeartHandshake,
  Target,
  ClipboardList,
  ShoppingBag,
  GraduationCap,
  Handshake,
  Megaphone,
  Scale,
  BadgeCheck,
  ArrowRight,
  Info,
} from "lucide-react";
import {
  MarketingHero,
  Section,
  SectionHeading,
  GlassCard,
  PrimaryButton,
  GhostButton,
} from "@/components/marketing/ui";
import {
  COMPANY_NAME,
  COMPANY_LEGAL,
  COMPANY_BOILERPLATE,
  FOUNDED_YEAR,
  SUPPORT_EMAIL,
} from "@/config/company";
import { JsonLd } from "@/components/seo/json-ld";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com";
import { pageMeta } from "@/lib/seo/page-meta";

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "About Us",
    // ≤155 chars — what Google shows uncut.
    description: `${COMPANY_NAME} is a freelance micro-task marketplace and digital skill-sharing community: micro-tasks, digital products, services and courses.`,
    path: "/about",
  });
}

/*
 * Copy rule for this page: every sentence has to be true of the product as it
 * is built. The old version carried a member count, a "$2M+ paid" figure, a
 * 4.9/5 rating, a "crossed $1M" milestone and a list of "largest communities" —
 * none of which came from data. If a number is ever added back, it must be
 * computed, not typed.
 */

/** The four things a member can actually do here, each with its own page. */
const PILLARS = [
  {
    icon: ClipboardList,
    title: "Freelance micro-tasks",
    body: "Short, defined jobs posted by businesses and advertisers — social actions, app testing, surveys, articles, video reviews and custom work. Each task shows its pay and the proof it needs before you start, and the proof is checked before it is paid.",
    href: "/microtask",
    link: "How micro-tasks work",
  },
  {
    icon: ShoppingBag,
    title: "Digital products and services",
    body: "Sellers list templates, graphics, ebooks, audio, code and freelance services. Every listing is reviewed before it goes live, and custom service deals run through escrow with admin mediation.",
    href: "/features/marketplace",
    link: "About the marketplace",
  },
  {
    icon: GraduationCap,
    title: "Online courses",
    body: "Learners take structured courses and receive a completion certificate. Approved tutors build and sell their own courses and live classes.",
    href: "/features/courses",
    link: "About courses",
  },
  {
    icon: Handshake,
    title: "Creator commissions",
    body: "Affiliates earn the commission a seller sets when someone buys through their link. Referral rewards are tied to the genuine activity of the people you invite.",
    href: "/features/affiliate",
    link: "About the affiliate program",
  },
];

const AUDIENCES = [
  { title: "People with spare time and a phone", body: "Pick up micro-tasks that fit around the rest of your day. You see the pay and the rules before you commit." },
  { title: "Designers, writers, developers and other creators", body: "Sell digital products once and deliver them automatically, or offer custom services with escrow-protected payment." },
  { title: "Teachers and subject experts", body: "Turn what you know into a course with lessons, resources and quizzes, and set your own price." },
  { title: "Businesses and advertisers", body: "Have real, verified people complete tasks for your brand, or run reviewed ad campaigns in specific placements.", href: "/advertise" },
];

const VALUES = [
  { icon: ShieldCheck, title: "Pay for verified work", body: "A task is paid once its proof is checked — automatically where a link can be read, by a person where it cannot. Each approval is written to the ledger once, so the same work is never paid twice." },
  { icon: Scale, title: "Rules stated up front", body: "Task pay, proof requirements, withdrawal minimums, fees and any plan requirement are shown before you act, not discovered afterwards." },
  { icon: BadgeCheck, title: "Fraud stays out", body: "Bots, duplicate accounts and fake proof are rejected and can close an account. Identity verification protects payouts, and one verified identity belongs to one account." },
  { icon: HeartHandshake, title: "Members over metrics", body: "Rejections come with a reason, appeals are possible, and support is reachable by email and from inside the app." },
];

export default function AboutPage() {
  return (
    <>
      {/* Who runs the site — the core trust (E-E-A-T) signal. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          url: `${SITE_URL}/about`,
          mainEntity: {
            "@type": "Organization",
            // The same entity as the site-wide Organization (app/layout.tsx).
            "@id": `${SITE_URL}/#organization`,
            name: COMPANY_NAME,
            legalName: COMPANY_LEGAL,
            url: SITE_URL,
            logo: `${SITE_URL}/icon-512.png`,
            foundingDate: String(FOUNDED_YEAR),
            description: COMPANY_BOILERPLATE,
            email: SUPPORT_EMAIL,
            sameAs: [...OFFICIAL_SOCIAL_PROFILES],
          },
        }}
      />
      <MarketingHero
        badge="About RevType"
        title="A marketplace for small jobs"
        highlight="and real skills"
        subtitle={`${COMPANY_NAME} is a freelance micro-task marketplace and digital skill-sharing community. People complete paid micro-tasks for real businesses, sell digital products and services, teach and take courses, and earn commissions as creators.`}
      />

      <Section width="narrow">
        <GlassCard className="sm:p-10">
          <div className="mb-4 inline-flex items-center gap-2 text-(--mk-accent)">
            <Target className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-wider">Our mission</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold text-(--mk-text) leading-relaxed">
            To give people a fair, transparent place to earn from their time and skills — with clear rules, verified work and payouts they can follow from start to finish.
          </h2>
          <p className="mt-5 text-(--mk-muted) leading-relaxed">
            The internet is full of &ldquo;earn online&rdquo; offers that hide how they work. {COMPANY_NAME} takes the opposite approach: every way to earn here is tied to something real — a task a business needs done, a product or service someone buys, a course someone enrols in. {COMPANY_NAME} is operated by {COMPANY_LEGAL}.
          </p>
        </GlassCard>
      </Section>

      <Section>
        <SectionHeading
          badge="What RevType is"
          tone="blue"
          title="Four ways to work, one account"
          subtitle="Use one of them or combine them. Each has its own page with the details."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <GlassCard key={p.title}>
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b)">
                <p.icon className="h-5 w-5 text-white" aria-hidden />
              </div>
              <h3 className="text-lg font-bold text-(--mk-text)">{p.title}</h3>
              <p className="mt-2 text-sm text-(--mk-muted) leading-relaxed">{p.body}</p>
              <Link href={p.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-(--mk-accent) hover:underline">
                {p.link} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </GlassCard>
          ))}
        </div>
      </Section>

      <Section className="bg-(--mk-band)">
        <SectionHeading badge="Who it is for" tone="cyan" title="Built for people who do the work — and the businesses that need it" />
        <div className="grid gap-4 sm:grid-cols-2">
          {AUDIENCES.map((a) => (
            <GlassCard key={a.title}>
              <h3 className="text-base font-bold text-(--mk-text)">{a.title}</h3>
              <p className="mt-2 text-sm text-(--mk-muted) leading-relaxed">{a.body}</p>
              {a.href && (
                <Link href={a.href} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-(--mk-accent) hover:underline">
                  Advertising and paid tasks for businesses <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
            </GlassCard>
          ))}
        </div>
      </Section>

      <Section width="narrow">
        <SectionHeading badge="Transparency" tone="purple" title="How RevType is funded" />
        <GlassCard className="sm:p-8">
          <div className="space-y-4 text-sm leading-relaxed text-(--mk-muted)">
            <p>
              Payments to members come out of real revenue. {COMPANY_NAME} earns from:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong className="text-(--mk-text)">Advertising</strong> — the platform displays ads, and some tasks and activities are sponsored by advertisers.</li>
              <li><strong className="text-(--mk-text)">Businesses that fund tasks and campaigns</strong> — a buyer pays up front for the work they want done.</li>
              <li><strong className="text-(--mk-text)">Marketplace fees</strong> — a platform fee on product and service sales.</li>
              <li><strong className="text-(--mk-text)">Optional paid plans</strong> — plans raise daily limits and unlock features. Withdrawals can require an active plan; the withdrawal screen tells you if they do.</li>
              <li><strong className="text-(--mk-text)">Withdrawal fees</strong> — shown to you before you confirm a payout.</li>
            </ul>
            <div className="flex gap-3 rounded-xl border border-(--mk-border) bg-(--mk-surface) p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-(--mk-accent)" aria-hidden />
              <p>
                <strong className="text-(--mk-text)">What {COMPANY_NAME} is not:</strong> it is not a paid-to-click site, not an investment scheme and not a guaranteed income. What you earn depends on the tasks available to you, the quality of your work and what you sell or teach. The{" "}
                <Link href="/help" className="font-semibold text-(--mk-accent) hover:underline">Help Center</Link>{" "}
                answers the common questions in detail.
              </p>
            </div>
          </div>
        </GlassCard>
      </Section>

      <Section>
        <SectionHeading badge="What we stand for" tone="purple" title="How we keep it fair" />
        <div className="grid gap-4 sm:grid-cols-2">
          {VALUES.map((v) => (
            <GlassCard key={v.title}>
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b)">
                <v.icon className="h-5 w-5 text-white" aria-hidden />
              </div>
              <h3 className="text-lg font-bold text-(--mk-text)">{v.title}</h3>
              <p className="mt-2 text-sm text-(--mk-muted) leading-relaxed">{v.body}</p>
            </GlassCard>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-(--mk-muted)">
          Seen something that breaks the rules?{" "}
          <Link href="/abuse" className="font-semibold text-(--mk-accent) hover:underline">Report abuse or copyright infringement</Link>.
        </p>
      </Section>

      <Section>
        <GlassCard className="text-center sm:p-12">
          <div className="mb-3 inline-flex items-center gap-2 text-(--mk-success)">
            <Megaphone className="w-5 h-5" aria-hidden />
            <span className="text-sm font-bold uppercase tracking-wider">Get started</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-(--mk-text)">Put your time and skills to work</h2>
          <p className="mx-auto mt-3 max-w-xl text-(--mk-muted)">
            Create a free account to see the micro-tasks available to you, open a storefront, or enrol in a course. Questions first? Read the{" "}
            <Link href="/help" className="font-semibold text-(--mk-accent) hover:underline">FAQ</Link>{" "}
            or the{" "}
            <Link href="/blog" className="font-semibold text-(--mk-accent) hover:underline">blog</Link>.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <PrimaryButton href="/register">
              <Users className="h-4 w-4" /> Create free account
            </PrimaryButton>
            <GhostButton href="/contact">Contact us →</GhostButton>
          </div>
        </GlassCard>
      </Section>
    </>
  );
}
