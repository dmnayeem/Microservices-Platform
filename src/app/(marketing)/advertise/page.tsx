import type { Metadata } from "next";
import {
  Megaphone,
  MousePointerClick,
  CalendarRange,
  ShieldCheck,
  Target,
  BarChart3,
  Layers,
  Users,
  ClipboardList,
  Wallet,
  Eye,
  Gauge,
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
import { AD_PLACEMENTS, placementSpec } from "@/lib/ad-placements";
import { BUYER_TASK_TYPES, BUYER_TASK_TYPE_META } from "@/lib/buyer-task-types";
import { COMPANY_NAME } from "@/config/company";

/**
 * Public explainer for advertisers.
 *
 * The slot list is rendered FROM `AD_PLACEMENTS`, which is the same array the
 * renderer and the Ad Manager read. A hand-typed list here would drift the first
 * time a space is added, and an advertiser who bought a space that no longer
 * exists is a refund conversation.
 *
 * Two deliberate omissions:
 *  - REWARDED_VIDEO is filtered out. It exists in the codebase but ships OFF,
 *    and a marketing page must not sell inventory that does not run.
 *  - No prices. The click price is a setting (`ads.cpcUsd`) with a per-space
 *    override, and sponsorship rates are per-space columns. Printing today's
 *    figure here would misquote every advertiser who reads it after the next
 *    rate change.
 */

/** Spaces we actually offer. See the note above on REWARDED_VIDEO. */
const SELLABLE = AD_PLACEMENTS.filter((p) => p.name !== "REWARDED_VIDEO");
const SLOT_COUNT = SELLABLE.length;
const NETWORK_SPACES = SELLABLE.filter((p) => placementSpec(p.name).networkAllowed);

export function generateMetadata(): Metadata {
  const title = "Advertise — Reach an Audience That Is Already Paying Attention";
  const description =
    `Run ads across ${SLOT_COUNT} placements on ${COMPANY_NAME}, sponsor a space ` +
    `outright, or pay real people to complete tasks for your brand. Every space, ` +
    `every format and every control, explained.`;
  return {
    title,
    description,
    alternates: { canonical: "/advertise" },
    openGraph: {
      title,
      description,
      url: "/advertise",
      type: "website",
      siteName: COMPANY_NAME,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

const BENEFITS = [
  {
    icon: Eye,
    title: "Attention, not scroll-past",
    body: "Our audience is here to complete work, so they arrive on purpose and stay on the page. Your ad sits inside a screen someone is already concentrating on.",
  },
  {
    icon: Target,
    title: "Targeted placement",
    body: "Choose the exact screen your ad runs on — the withdrawal page, the social feed, a video task, the wallet. Each space is bought separately.",
  },
  {
    icon: MousePointerClick,
    title: "Pay for clicks, not guesses",
    body: "Campaigns are charged per click. The price in force at the moment of the click is what gets recorded, so your reports never rewrite themselves later.",
  },
  {
    icon: BarChart3,
    title: "Reporting per space",
    body: "Impressions, clicks and spend are reported for each placement separately, so you can tell which screen is actually working for you.",
  },
  {
    icon: Gauge,
    title: "Budget you control",
    body: "Set a campaign budget and a daily cap. Spend is drawn against the remaining budget on every charge, and a campaign that runs out pauses itself.",
  },
  {
    icon: Users,
    title: "Or skip ads entirely",
    body: "Buy work instead of impressions: create tasks and have real, verified people do them for you.",
  },
];

const BUY_MODES = [
  {
    icon: MousePointerClick,
    title: "Cost per click",
    body: "The default. You are charged when someone clicks. Each space can carry its own click price; spaces that have not been priced individually use the platform rate.",
  },
  {
    icon: CalendarRange,
    title: "Sponsor a space",
    body: "Some spaces can be rented outright for a period, so your creative is the only one that runs there. Availability and the monthly rate are set per space.",
  },
  {
    icon: ClipboardList,
    title: "Buy the work itself",
    body: `Create ${BUYER_TASK_TYPES.map((t) => BUYER_TASK_TYPE_META[t].label.toLowerCase()).join(", ")} tasks. You fund them up front, set exactly what proof you need, and review what comes back.`,
  },
];

const RULES = [
  {
    icon: ShieldCheck,
    title: "Every ad is reviewed",
    body: "An administrator approves an ad before it can serve. Changing anything material about a live ad sends it back for review rather than swapping the creative silently.",
  },
  {
    icon: Layers,
    title: "Each space has a shape",
    body: "Every placement declares which creative sizes it accepts and a hard height ceiling the renderer enforces, so an oversized creative can never take over a page.",
  },
  {
    icon: Wallet,
    title: "Funded before it runs",
    body: "A campaign serves only while it has budget left. Spend is recorded against the campaign at the moment it happens, not reconstructed afterwards.",
  },
];

export default function AdvertisePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-(--mk-accent)/10 to-transparent"
        />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-16 pb-10 sm:pt-24 sm:pb-14">
          <div className="mb-5">
            <BadgePill tone="cyan">Advertise</BadgePill>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-(--mk-text) tracking-tight leading-[1.1]">
            Put your brand{" "}
            <span className="bg-linear-to-r from-(--mk-rail-a) to-(--mk-rail-b) bg-clip-text text-transparent">
              where people are already looking
            </span>
          </h1>
          <p className="mt-6 text-lg text-(--mk-muted) leading-relaxed max-w-2xl mx-auto">
            {COMPANY_NAME} has {SLOT_COUNT} ad spaces across the platform, from
            the feed to the withdrawal page. Buy clicks, sponsor a space
            outright, or pay real people to complete tasks for you.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <PrimaryButton href="/profile/become-creator">
              <Megaphone className="h-4 w-4" /> Apply to advertise
            </PrimaryButton>
            <GhostButton href="/contact">Talk to us about sponsorship →</GhostButton>
          </div>
        </div>
      </section>

      <Section className="bg-(--mk-band)">
        <StatGrid
          stats={[
            { value: String(SLOT_COUNT), label: "Ad spaces on the platform" },
            { value: String(BUY_MODES.length), label: "Ways to buy" },
            { value: "Per-space", label: "Pricing and reporting" },
            { value: "Reviewed", label: "Every ad, before it runs" },
          ]}
        />
      </Section>

      {/* Benefits */}
      <Section>
        <div id="benefits" className="scroll-mt-24" />
        <SectionHeading
          badge="Why advertise here"
          tone="cyan"
          title="What you get that a general ad network cannot give you"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <GlassCard key={b.title}>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--mk-accent)/10 border border-(--mk-accent)/20">
                <b.icon className="h-5 w-5 text-(--mk-accent)" />
              </div>
              <h3 className="text-base font-bold text-(--mk-text)">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-(--mk-muted)">
                {b.body}
              </p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* Ways to buy */}
      <Section className="bg-(--mk-band)">
        <SectionHeading
          badge="How to buy"
          tone="blue"
          title="Three ways to spend a budget here"
          subtitle="Rates are set per space and can change. You always see the current price in the Ad Manager before you commit a budget."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {BUY_MODES.map((m) => (
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

      {/* The slot list */}
      <Section>
        <div id="slots" className="scroll-mt-24" />
        <SectionHeading
          badge="Ad spaces"
          tone="cyan"
          title={`All ${SLOT_COUNT} placements`}
          subtitle="This is the complete list, exactly as the platform defines it. Each one is bought, priced and reported on separately."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SELLABLE.map((p) => (
            <GlassCard key={p.name} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-(--mk-text)">{p.label}</h3>
                {!placementSpec(p.name).networkAllowed && (
                  <span className="shrink-0 rounded-full border border-(--mk-border-strong) px-2 py-0.5 text-[11px] font-semibold text-(--mk-subtle)">
                    Direct only
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-(--mk-muted)">
                {p.where}
              </p>
            </GlassCard>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-(--mk-subtle)">
          {NETWORK_SPACES.length} of these accept network creatives.
          &ldquo;Direct only&rdquo; spaces are sold by us directly, because the
          person seeing the ad is being rewarded on that screen.
        </p>
      </Section>

      {/* Rules */}
      <Section className="bg-(--mk-band)">
        <SectionHeading
          badge="How it is kept clean"
          tone="emerald"
          title="The rules that protect both sides"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {RULES.map((r) => (
            <GlassCard key={r.title}>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--mk-success)/10 border border-emerald-500/20">
                <r.icon className="h-5 w-5 text-(--mk-success)" />
              </div>
              <h3 className="text-base font-bold text-(--mk-text)">{r.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-(--mk-muted)">
                {r.body}
              </p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section width="narrow">
        <GlassCard className="text-center">
          <h2 className="text-2xl font-bold text-(--mk-text)">
            Ready to run your first campaign?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-(--mk-muted)">
            Apply for advertiser access, fund a campaign, and pick your spaces.
            Current rates for every placement are shown in the Ad Manager.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <PrimaryButton href="/profile/become-creator">
              Apply to advertise
            </PrimaryButton>
            <GhostButton href="/microtask">See what workers do →</GhostButton>
          </div>
        </GlassCard>
      </Section>
    </>
  );
}
