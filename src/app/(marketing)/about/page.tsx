import type { Metadata } from "next";
import { Users, Globe2, ShieldCheck, Zap, HeartHandshake, Target, TrendingUp } from "lucide-react";
import {
  MarketingHero,
  Section,
  SectionHeading,
  GlassCard,
  StatGrid,
  CountryFlags,
  PrimaryButton,
  GhostButton,
} from "@/components/marketing/ui";
import { COMPANY_NAME, COMPANY_LEGAL, FOUNDED_YEAR, GLOBAL_COUNTRIES } from "@/config/company";

export const metadata: Metadata = {
  title: "About Us",
  description: `${COMPANY_NAME} is a global rewards platform helping people in 180+ countries earn online and cash out securely.`,
};

const STATS = [
  { value: "100K+", label: "Active members" },
  { value: "$2M+", label: "Paid to members" },
  { value: "180+", label: "Countries" },
  { value: "4.9/5", label: "Member rating" },
];

const VALUES = [
  { icon: ShieldCheck, title: "Trust first", body: "Every payout is real and on time. We hold ourselves to bank-grade security and transparent rules — no hidden conditions, ever." },
  { icon: Globe2, title: "Borderless by design", body: "One platform, every timezone. Members earn and cash out in their local currency or crypto, wherever they are." },
  { icon: Zap, title: "Simple, not shallow", body: "Earning should take minutes to understand. Behind that simplicity is serious engineering for fraud protection and fast payments." },
  { icon: HeartHandshake, title: "Members over metrics", body: "We win when our members do. Support is 24/7 and human, and the product is shaped by community feedback." },
];

const MILESTONES = [
  { year: `${FOUNDED_YEAR}`, title: "Founded", body: "A small remote team set out to make online earning honest, simple, and truly global." },
  { year: `${FOUNDED_YEAR + 1}`, title: "Went global", body: "Localized payouts and support rolled out across the Americas, Europe, the Middle East, and Asia." },
  { year: `${FOUNDED_YEAR + 2}`, title: "Crossed $1M paid", body: "Millions of tasks completed and our first million dollars sent to members worldwide." },
  { year: "Today", title: "100K+ members, 180+ countries", body: "A trusted community earning every day — and we're just getting started." },
];

export default function AboutPage() {
  return (
    <>
      <MarketingHero
        badge="About us"
        title="Earning online, made"
        highlight="honest and global"
        subtitle={`${COMPANY_NAME} is a worldwide rewards platform where anyone can turn spare time into real income — completing simple tasks, surveys, and offers, then cashing out securely in their local currency or crypto.`}
      />

      <Section>
        <StatGrid stats={STATS} />
      </Section>

      <Section width="narrow">
        <GlassCard className="sm:p-10">
          <div className="mb-4 inline-flex items-center gap-2 text-indigo-600">
            <Target className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-wider">Our mission</span>
          </div>
          <p className="text-xl sm:text-2xl font-semibold text-(--mk-text) leading-relaxed">
            To give everyone, everywhere, a fair and simple way to earn online — with payouts they can trust and rules they can understand.
          </p>
          <p className="mt-5 text-(--mk-muted) leading-relaxed">
            {COMPANY_NAME} began in {FOUNDED_YEAR} with a frustration shared by millions: the internet is full of &ldquo;earn money online&rdquo; promises, and almost none of them pay. We built the opposite — a platform where the tasks are real, the payments are guaranteed, and it works the same whether you&apos;re in New York, Lagos, Dhaka, Berlin, or Manila. Operated by {COMPANY_LEGAL}, a remote-first company with team members across continents, we serve a community that never sleeps.
          </p>
        </GlassCard>
      </Section>

      <Section>
        <SectionHeading badge="Where we operate" tone="cyan" title="Trusted across the globe" subtitle="Members earn and get paid in 180+ countries. A few of our largest communities:" />
        <CountryFlags countries={GLOBAL_COUNTRIES} />
      </Section>

      <Section>
        <SectionHeading badge="What we stand for" tone="purple" title="Our values" />
        <div className="grid gap-4 sm:grid-cols-2">
          {VALUES.map((v) => (
            <GlassCard key={v.title}>
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-purple-600">
                <v.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-(--mk-text)">{v.title}</h3>
              <p className="mt-2 text-sm text-(--mk-muted) leading-relaxed">{v.body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      <Section width="narrow">
        <SectionHeading badge="Our story" title="How we got here" />
        <div className="space-y-4">
          {MILESTONES.map((m) => (
            <div key={m.title} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-linear-to-br from-blue-500 to-purple-600 text-xs font-bold text-white">
                  {m.year}
                </div>
              </div>
              <GlassCard className="flex-1">
                <h3 className="font-bold text-(--mk-text)">{m.title}</h3>
                <p className="mt-1 text-sm text-(--mk-muted)">{m.body}</p>
              </GlassCard>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <GlassCard className="text-center sm:p-12">
          <div className="mb-3 inline-flex items-center gap-2 text-emerald-600">
            <TrendingUp className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-wider">Join us</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-(--mk-text)">Start earning in minutes</h2>
          <p className="mx-auto mt-3 max-w-xl text-(--mk-muted)">
            Create a free account and complete your first task today — or join the team building the future of online earning.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <PrimaryButton href="/register">
              <Users className="h-4 w-4" /> Create free account
            </PrimaryButton>
            <GhostButton href="/careers">We&apos;re hiring →</GhostButton>
          </div>
        </GlassCard>
      </Section>
    </>
  );
}
