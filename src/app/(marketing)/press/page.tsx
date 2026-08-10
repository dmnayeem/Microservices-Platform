import type { Metadata } from "next";
import { Sparkles, Mail, Palette } from "lucide-react";
import {
  MarketingHero,
  Section,
  SectionHeading,
  GlassCard,
  PrimaryButton,
} from "@/components/marketing/ui";
import { COMPANY_NAME, COMPANY_LEGAL, FOUNDED_YEAR, PRESS_EMAIL, COMPANY_BOILERPLATE } from "@/config/company";

export const metadata: Metadata = {
  title: "Press Kit",
  description: `Media resources, brand assets, and fast facts about ${COMPANY_NAME}.`,
};

const FACTS = [
  { k: "Company", v: COMPANY_LEGAL },
  { k: "Product", v: `${COMPANY_NAME} — global earning platform` },
  { k: "Founded", v: `${FOUNDED_YEAR}` },
  { k: "Model", v: "Remote-first, worldwide" },
  { k: "Members", v: "100,000+" },
  { k: "Reach", v: "180+ countries" },
  { k: "Paid to members", v: "$2M+" },
  { k: "Press contact", v: PRESS_EMAIL },
];

const COLORS = [
  { name: "Blue", hex: "#3b82f6" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Slate 950", hex: "#020617" },
];

export default function PressPage() {
  return (
    <>
      <MarketingHero
        badge="Press & media"
        title="Press"
        highlight="kit"
        subtitle={`Everything you need to write about ${COMPANY_NAME} — boilerplate, fast facts, and brand assets. For interviews or additional materials, get in touch.`}
      />

      <Section width="narrow">
        <SectionHeading title="About the company" />
        <GlassCard className="sm:p-8">
          <p className="text-(--mk-text) leading-relaxed">{COMPANY_BOILERPLATE}</p>
        </GlassCard>
      </Section>

      <Section width="narrow">
        <SectionHeading badge="At a glance" tone="cyan" title="Fast facts" />
        <GlassCard className="p-0 overflow-hidden">
          <dl className="divide-y divide-(--mk-border)">
            {FACTS.map((f) => (
              <div key={f.k} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <dt className="text-sm text-(--mk-muted)">{f.k}</dt>
                <dd className="text-sm font-semibold text-(--mk-text) text-right">{f.v}</dd>
              </div>
            ))}
          </dl>
        </GlassCard>
      </Section>

      <Section width="narrow">
        <SectionHeading badge="Brand" tone="purple" title="Logo & colors" subtitle="Please don't alter, recolor, or stretch the logo. Keep clear space around it and use it on dark backgrounds where possible." />
        <div className="grid gap-4 sm:grid-cols-2">
          <GlassCard className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-blue-500 to-purple-600">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <div>
              <p className="text-lg font-bold bg-linear-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">{COMPANY_NAME}</p>
              <p className="text-xs text-(--mk-subtle)">Primary logo (mark + wordmark)</p>
            </div>
          </GlassCard>
          <GlassCard>
            <div className="mb-3 inline-flex items-center gap-2 text-(--mk-text)">
              <Palette className="h-4 w-4" /> <span className="text-sm font-semibold">Brand colors</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map((c) => (
                <div key={c.name} className="text-center">
                  <div className="h-12 w-full rounded-lg border border-(--mk-border)" style={{ background: c.hex }} />
                  <p className="mt-1 text-[10px] text-(--mk-muted)">{c.name}</p>
                  <p className="text-[10px] font-mono text-(--mk-subtle)">{c.hex}</p>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </Section>

      <Section width="narrow">
        <GlassCard className="text-center sm:p-10">
          <div className="mb-3 inline-flex items-center gap-2 text-indigo-600">
            <Mail className="h-5 w-5" /><span className="text-sm font-bold uppercase tracking-wider">Media inquiries</span>
          </div>
          <h2 className="text-2xl font-extrabold text-(--mk-text)">Let&apos;s talk</h2>
          <p className="mx-auto mt-2 max-w-lg text-(--mk-muted)">
            Writing a story, need a quote, or want higher-resolution assets? Reach our press team directly.
          </p>
          <div className="mt-6 flex justify-center"><PrimaryButton href={`mailto:${PRESS_EMAIL}`}>{PRESS_EMAIL}</PrimaryButton></div>
        </GlassCard>
      </Section>
    </>
  );
}
