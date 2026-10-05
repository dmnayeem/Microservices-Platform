import type { Metadata } from "next";
import Link from "next/link";
import {
  Handshake,
  Link2,
  Share2,
  Wallet,
  ShoppingBag,
  GraduationCap,
  BarChart3,
  Percent,
  Users,
  Globe2,
  BadgeCheck,
  ArrowRight,
} from "lucide-react";
import {
  Section,
  SectionHeading,
  GlassCard,
  StatGrid,
  PrimaryButton,
  GhostButton, MarketingHero, CtaBand
} from "@/components/marketing/ui";
import { COMPANY_NAME } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Affiliate Program — Earn Commission on Every Sale",
    description: `Promote marketplace products and courses with your personal link on ${COMPANY_NAME} and earn the seller-set commission on every sale — paid straight to your wallet.`,
    path: "/features/affiliate",
  });
}

const STATS = [
  { value: "Per-sale", label: "Commission on every order" },
  { value: "Wallet", label: "Paid straight to you" },
  { value: "Products", label: "& courses to promote" },
  { value: "Yours", label: "Your links, your audience" },
];

const STEPS = [
  { icon: BadgeCheck, title: "Apply & get approved", body: "Tell us how you'll promote. Once approved, your affiliate dashboard unlocks." },
  { icon: Link2, title: "Grab your links", body: "Every product and course gives you a personal tracking link in one click." },
  { icon: Share2, title: "Share anywhere", body: "Post your links on social media, your blog, a video description, or a group chat." },
  { icon: Wallet, title: "Earn on every sale", body: "When someone buys through your link, the commission lands in your wallet automatically." },
];

const PROMOTE = [
  { icon: ShoppingBag, title: "Marketplace products", body: "Promote reviewed digital products and services from marketplace sellers and earn the reward each seller sets.", href: "/features/marketplace" },
  { icon: GraduationCap, title: "Online courses", body: "Recommend courses from approved tutors and earn a commission on enrolments you refer.", href: "/features/courses" },
];

const WHY = [
  { icon: Percent, title: "Seller-set rewards", body: "Each product carries its own reward — a percentage of the sale or a fixed amount per order." },
  { icon: BarChart3, title: "Transparent tracking", body: "See your clicks, sales, and commissions in real time from a clean affiliate dashboard." },
  { icon: Globe2, title: "Promote anywhere", body: "Share your links on social media, a blog, a video description or a group chat — wherever your audience already is. Spam is not allowed." },
];

export default function AffiliateFeaturePage() {
  return (
    <>
      <MarketingHero
        badge="Affiliate Program"
        title="Promote great products,"
        highlight="earn on every sale"
        subtitle="Share products and courses with your personal link. When someone buys through it, you earn the commission the seller set — paid to your wallet. No stock, no upfront cost."
        actions={
          <>
            <PrimaryButton href="/profile/become-creator">
              <Handshake className="h-4 w-4" /> Apply to become an affiliate
            </PrimaryButton>
            <GhostButton href="/register">Create free account →</GhostButton>
          </>
        }
      />

      <Section className="bg-(--mk-band)">
        <StatGrid stats={STATS} />
      </Section>

      {/* How it works */}
      <Section>
        <SectionHeading
          badge="How it works"
          tone="purple"
          title="Start earning in four simple steps"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <GlassCard key={s.title} className="relative pt-8">
              <span className="absolute -top-3 left-6 inline-flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) text-sm font-extrabold text-white shadow-sm">
                {i + 1}
              </span>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--mk-accent)/10 border border-(--mk-accent)/20">
                <s.icon className="h-5 w-5 text-(--mk-accent)" />
              </div>
              <h3 className="font-bold text-(--mk-text)">{s.title}</h3>
              <p className="mt-1.5 text-sm text-(--mk-muted) leading-relaxed">{s.body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* What you can promote */}
      <Section className="bg-(--mk-band)">
        <SectionHeading
          badge="What you can promote"
          tone="emerald"
          title="Two catalogs, one commission stream"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {PROMOTE.map((p) => (
            <Link key={p.title} href={p.href} className="group block">
              <GlassCard className="h-full transition-all group-hover:shadow-md group-hover:border-(--mk-border-strong)">
                <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) shadow-sm">
                  <p.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-(--mk-text) flex items-center gap-1.5">
                  {p.title}
                  <ArrowRight className="w-4 h-4 text-(--mk-subtle) group-hover:text-(--mk-accent) transition-colors" />
                </h3>
                <p className="mt-2 text-sm text-(--mk-muted) leading-relaxed">{p.body}</p>
              </GlassCard>
            </Link>
          ))}
        </div>
      </Section>

      {/* Why */}
      <Section>
        <SectionHeading badge="Why affiliates love it" title="Fair, transparent, and hands-off" />
        <div className="grid gap-4 sm:grid-cols-3">
          {WHY.map((b) => (
            <GlassCard key={b.title}>
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) shadow-sm">
                <b.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-(--mk-text)">{b.title}</h3>
              <p className="mt-2 text-sm text-(--mk-muted) leading-relaxed">{b.body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* Affiliate vs referrals */}
      <Section width="narrow">
        <GlassCard className="sm:p-10">
          <div className="mb-3 inline-flex items-center gap-2 text-(--mk-accent)">
            <Users className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-wider">Affiliate vs referrals</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-(--mk-text)">
            Two ways to earn from your network
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-(--mk-surface-2) border border-(--mk-border) p-4">
              <p className="font-bold text-(--mk-text)">Affiliate</p>
              <p className="mt-1 text-sm text-(--mk-muted) leading-relaxed">
                Earn a commission when people buy the specific products and
                courses you promote with your links.
              </p>
            </div>
            <div className="rounded-xl bg-(--mk-surface-2) border border-(--mk-border) p-4">
              <p className="font-bold text-(--mk-text)">Referrals</p>
              <p className="mt-1 text-sm text-(--mk-muted) leading-relaxed">
                Invite people to join and earn referral rewards tied to their
                genuine activity on the platform.{" "}
                <Link href="/referral" className="font-semibold text-(--mk-accent) hover:underline">How referral rewards work</Link>
              </p>
            </div>
          </div>
          <p className="mt-5 text-sm text-(--mk-subtle)">
            You can use both at the same time — they stack.
          </p>
        </GlassCard>
      </Section>

      {/* Final CTA */}
      <Section>
        <CtaBand
          title="Ready to earn from what you share?"
          subtitle="Apply to join the affiliate program and start turning your audience into commission."
          primary={{ href: "/profile/become-creator", label: <><Handshake className="h-4 w-4" /> Apply to become an affiliate</> }}
          secondary={{ href: "/register", label: "Create free account →" }}
        />
      </Section>
    </>
  );
}
