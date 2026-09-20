import type { Metadata } from "next";
import {
  Users,
  UserPlus,
  HeartHandshake,
  Trophy,
  ShoppingBag,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarCheck,
  ShieldCheck,
  Link2,
  Share2,
  Wallet,
  Info,
} from "lucide-react";
import {
  Section,
  SectionHeading,
  GlassCard,
  StatGrid,
  PrimaryButton,
  GhostButton,
  BadgePill,
} from "@/components/marketing/ui";
import { COMPANY_NAME } from "@/config/company";

/**
 * Public explainer for the referral programme. Deliberately NOT in the nav —
 * it is linked from the "Team & Referrals" card on the landing page and from
 * the other two marketing pages.
 *
 * ## Why there is not a single number on this page
 *
 * Every referral reward is an admin setting, and `REFERRAL_BONUS_DEFAULTS` in
 * src/lib/referral-config.ts currently has `enabled: false` with every points
 * value and every percentage at 0. Several of the models ship switched off. A
 * page that said "earn 500 points per friend" would therefore be wrong in two
 * separate ways at once: wrong amount, and describing a bonus that is not
 * running.
 *
 * So this page describes the MECHANISMS — which is what the owner can honestly
 * publish today — and points the reader at their own referrals screen, which
 * reads the live configuration. Do not add figures here.
 */

const MODELS = [
  {
    icon: HeartHandshake,
    title: "Two-way bonus",
    body: "Both sides are paid. The person who invites earns, and the person who joined through the link earns too — so the invitation is worth accepting, not just worth sending.",
  },
  {
    icon: UserPlus,
    title: "Sign-up bonus",
    body: "A one-off reward to the referrer the moment someone they invited registers a real account.",
  },
  {
    icon: Trophy,
    title: "Milestone ladder",
    body: "Named steps — bring this many active people, reach this step. A step pays either points or free months of a subscription plan, and each step pays once.",
  },
  {
    icon: ShoppingBag,
    title: "Purchase bonus",
    body: "A reward when someone you invited buys something: a subscription plan, or their first purchase of anything else such as a course or a marketplace item.",
  },
  {
    icon: Layers,
    title: "Multi-level commission",
    body: "A share of what your team earns from tasks, flowing up the chain as many as ten levels deep. How many levels you personally earn from depends on your plan.",
  },
];

const MONEY_SHARE = [
  {
    icon: ArrowDownToLine,
    title: "A share of deposits",
    body: "A percentage of what someone you invited deposits can be paid to you — so a referral keeps being worth something long after the day they joined.",
  },
  {
    icon: ArrowUpFromLine,
    title: "A share of withdrawals",
    body: "The same on the way out, and paid by the platform rather than taken out of their payout. Nobody you invited is ever paid less because you invited them.",
  },
  {
    icon: CalendarCheck,
    title: "Month-end activity bonus",
    body: "An end-of-month reward when someone you invited actually showed up — measured in distinct days they completed their daily mission, not in one busy afternoon.",
  },
];

const FAIRNESS = [
  {
    icon: ShieldCheck,
    title: "Only real activity counts",
    body: "A milestone counts someone as active only if they genuinely used the platform on several separate days inside a recent window. A pile of registered-and-abandoned accounts climbs nothing.",
  },
  {
    icon: ShieldCheck,
    title: "Money bonuses are capped",
    body: "What one invited person's deposits and withdrawals can ever be worth to you is capped over a rolling window, and the withdrawal share is paid only on money they actually earned here.",
  },
  {
    icon: ShieldCheck,
    title: "Referrers stay active too",
    body: "Earning referral bonuses can require you to be keeping up your own daily activity, and some rewards can require a qualifying plan. Your referrals screen tells you where you stand.",
  },
];

const STEPS = [
  {
    n: 1,
    icon: Link2,
    title: "Get your link",
    body: "Every account has a personal referral link and code from the day it is created. No application, no approval.",
  },
  {
    n: 2,
    icon: Share2,
    title: "Share it",
    body: "Send it to anyone — a message, a group, a video description, a post. Anyone who signs up through it is attributed to you.",
  },
  {
    n: 3,
    icon: Users,
    title: "They get started",
    body: "The more genuinely your invitee uses the platform, the more of these models actually pay — most of them are tied to real activity on purpose.",
  },
  {
    n: 4,
    icon: Wallet,
    title: "Rewards land in your wallet",
    body: "Every referral reward is written to your balance with its own ledger entry, so you can see exactly which one paid and when.",
  },
];

export function generateMetadata(): Metadata {
  const title = "Referral Program — Every Way Inviting People Pays";
  const description =
    `${COMPANY_NAME} runs ${MODELS.length} different referral models, from a ` +
    `two-way welcome bonus to commission ten levels deep, plus a share of what ` +
    `the people you invite deposit and withdraw. Here is how each one works.`;
  return {
    title,
    description,
    alternates: { canonical: "/referral" },
    openGraph: {
      title,
      description,
      url: "/referral",
      type: "website",
      siteName: COMPANY_NAME,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function ReferralPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-(--mk-grad-a)/10 to-transparent"
        />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-16 pb-10 sm:pt-24 sm:pb-14">
          <div className="mb-5">
            <BadgePill tone="purple">Referral Program</BadgePill>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-(--mk-text) tracking-tight leading-[1.1]">
            Invite once,{" "}
            <span className="bg-linear-to-r from-(--mk-rail-a) to-(--mk-rail-b) bg-clip-text text-transparent">
              earn from {MODELS.length} different rewards
            </span>
          </h1>
          <p className="mt-6 text-lg text-(--mk-muted) leading-relaxed max-w-2xl mx-auto">
            {COMPANY_NAME} does not have one referral bonus — it has{" "}
            {MODELS.length} separate models, and they stack. This page explains
            what each one rewards and what has to happen for it to pay.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <PrimaryButton href="/register">
              <UserPlus className="h-4 w-4" /> Get your referral link
            </PrimaryButton>
            <GhostButton href="/microtask">See how people earn here →</GhostButton>
          </div>
        </div>
      </section>

      <Section className="bg-(--mk-band)">
        <StatGrid
          stats={[
            { value: String(MODELS.length), label: "Referral models" },
            { value: "10", label: "Levels deep, at most" },
            { value: "Both", label: "Sides can be paid" },
            { value: "Free", label: "No application needed" },
          ]}
        />
      </Section>

      {/* The honesty note. This is the most important block on the page. */}
      <Section width="narrow">
        <GlassCard>
          <div className="flex gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-(--mk-accent)" />
            <div>
              <h2 className="text-base font-bold text-(--mk-text)">
                About the amounts
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-(--mk-muted)">
                Every reward below is configured by an administrator, and which
                models are switched on can change. That is why this page
                describes how each model works rather than quoting a figure — a
                number printed here would be out of date the day it changed. The
                live amounts, and which bonuses are currently active, are on
                your own referrals screen once you have an account.
              </p>
            </div>
          </div>
        </GlassCard>
      </Section>

      {/* The five models */}
      <Section>
        <div id="models" className="scroll-mt-24" />
        <SectionHeading
          badge="The models"
          tone="purple"
          title={`${MODELS.length} ways a referral can pay you`}
          subtitle="These are separate systems, not alternatives. More than one can pay on the same person."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODELS.map((m) => (
            <GlassCard key={m.title}>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--mk-accent)/10 border border-(--mk-accent)/20">
                <m.icon className="h-5 w-5 text-(--mk-accent)" />
              </div>
              <h3 className="text-base font-bold text-(--mk-text)">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-(--mk-muted)">
                {m.body}
              </p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* Ongoing share */}
      <Section className="bg-(--mk-band)">
        <SectionHeading
          badge="Ongoing rewards"
          tone="emerald"
          title="It does not stop at sign-up"
          subtitle="Three more rewards that keep paying while the people you invited keep using the platform."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {MONEY_SHARE.map((m) => (
            <GlassCard key={m.title}>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--mk-success)/10 border border-emerald-500/20">
                <m.icon className="h-5 w-5 text-(--mk-success)" />
              </div>
              <h3 className="text-base font-bold text-(--mk-text)">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-(--mk-muted)">
                {m.body}
              </p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section>
        <SectionHeading
          badge="How it works"
          tone="purple"
          title="Four steps, and the first three take a minute"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <GlassCard key={s.n} className="relative pt-8">
              <span className="absolute -top-3 left-6 inline-flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) text-sm font-extrabold text-white shadow-sm">
                {s.n}
              </span>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--mk-accent)/10 border border-(--mk-accent)/20">
                <s.icon className="h-5 w-5 text-(--mk-accent)" />
              </div>
              <h3 className="text-base font-bold text-(--mk-text)">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-(--mk-muted)">
                {s.body}
              </p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* Fairness */}
      <Section className="bg-(--mk-band)">
        <SectionHeading
          badge="Why it stays worth something"
          tone="blue"
          title="The guards that keep the programme real"
          subtitle="A referral programme that can be farmed pays nothing to the people using it honestly. These rules exist so it keeps paying."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {FAIRNESS.map((f) => (
            <GlassCard key={f.title}>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--mk-accent)/10 border border-(--mk-accent)/20">
                <f.icon className="h-5 w-5 text-(--mk-accent)" />
              </div>
              <h3 className="text-base font-bold text-(--mk-text)">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-(--mk-muted)">
                {f.body}
              </p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section width="narrow">
        <GlassCard className="text-center">
          <h2 className="text-2xl font-bold text-(--mk-text)">
            Your link is waiting
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-(--mk-muted)">
            Create a free account and your referral link and code are there
            immediately — along with the live rates for every bonus above.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <PrimaryButton href="/register">Create free account</PrimaryButton>
            <GhostButton href="/advertise">Advertise here instead →</GhostButton>
          </div>
        </GlassCard>
      </Section>
    </>
  );
}
