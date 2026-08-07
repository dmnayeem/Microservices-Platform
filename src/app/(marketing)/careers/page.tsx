import type { Metadata } from "next";
import { Globe2, Rocket, GraduationCap, HeartPulse, Coins, Clock, MapPin, ArrowRight } from "lucide-react";
import {
  MarketingHero,
  Section,
  SectionHeading,
  GlassCard,
  PrimaryButton,
} from "@/components/marketing/ui";
import { COMPANY_NAME, CAREERS_EMAIL } from "@/config/company";

export const metadata: Metadata = {
  title: "Careers",
  description: `Join ${COMPANY_NAME} — a remote-first team building the global platform for earning online.`,
};

const PERKS = [
  { icon: Globe2, title: "Remote-first, worldwide", body: "Work from anywhere. We hire across timezones and optimize for async, not attendance." },
  { icon: Coins, title: "Competitive pay + equity", body: "Fair, location-aware compensation and meaningful ownership in what you help build." },
  { icon: GraduationCap, title: "Learning budget", body: "An annual stipend for courses, conferences, and books — plus time to use it." },
  { icon: HeartPulse, title: "Health & wellness", body: "Health coverage, generous paid time off, and a genuine no-burnout culture." },
  { icon: Clock, title: "Flexible hours", body: "Own your schedule. We care about impact and outcomes, not clocked hours." },
  { icon: Rocket, title: "Real impact, fast", body: "Small team, big product. Your work reaches members in 180+ countries within weeks." },
];

const ROLES = [
  { title: "Senior Frontend Engineer", team: "Engineering", location: "Remote · Global", type: "Full-time", blurb: "Own high-impact surfaces in our Next.js/React app used by 100K+ members." },
  { title: "Backend Engineer (Payments)", team: "Engineering", location: "Remote · Global", type: "Full-time", blurb: "Build the payout and fraud systems that move money reliably across borders." },
  { title: "Community Manager", team: "Community", location: "Remote · LATAM / Asia", type: "Full-time", blurb: "Grow and support our member communities across regions and languages." },
  { title: "Trust & Safety Analyst", team: "Operations", location: "Remote · Global", type: "Full-time", blurb: "Keep the platform clean — detect abuse, protect members, refine our policies." },
  { title: "Product Designer", team: "Design", location: "Remote · Global", type: "Full-time", blurb: "Shape simple, delightful earning experiences that work in every market." },
  { title: "Customer Support Specialist", team: "Support", location: "Remote · Multiple regions", type: "Full-time", blurb: "Be the human, 24/7 voice members reach when they need help." },
];

const HIRING = [
  { step: "1", title: "Apply", body: "Send your CV/portfolio to our careers inbox with the role in the subject." },
  { step: "2", title: "Intro call", body: "A 30-minute chat to get to know each other and the role." },
  { step: "3", title: "Practical", body: "A short, paid take-home or live exercise that mirrors real work." },
  { step: "4", title: "Team & offer", body: "Meet the team, then an offer — usually within two weeks end to end." },
];

export default function CareersPage() {
  return (
    <>
      <MarketingHero
        badge="Careers"
        title="Build the future of"
        highlight="online earning"
        subtitle={`${COMPANY_NAME} is a remote-first team on a mission to give everyone, everywhere a fair way to earn online. If that excites you, we'd love to meet you.`}
      />

      <Section>
        <SectionHeading badge="Why us" tone="purple" title="Life at EarnGPT" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PERKS.map((p) => (
            <GlassCard key={p.title}>
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-purple-600">
                <p.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white">{p.title}</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{p.body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading badge="Open roles" tone="cyan" title="Come build with us" subtitle="Don't see a perfect fit? Send us a note anyway — great people make their own roles." />
        <div className="space-y-3">
          {ROLES.map((r) => (
            <a
              key={r.title}
              href={`mailto:${CAREERS_EMAIL}?subject=${encodeURIComponent("Application: " + r.title)}`}
              className="group block rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl p-5 hover:bg-white/10 hover:border-blue-500/30 transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-white">{r.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{r.blurb}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                    <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-1">{r.team}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2.5 py-1"><MapPin className="h-3 w-3" /> {r.location}</span>
                    <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-1">{r.type}</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-linear-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-bold text-white shrink-0">
                  Apply <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </Section>

      <Section width="narrow">
        <SectionHeading badge="Process" title="How hiring works" />
        <div className="grid gap-4 sm:grid-cols-2">
          {HIRING.map((h) => (
            <GlassCard key={h.step}>
              <div className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-linear-to-br from-blue-500 to-purple-600 text-sm font-bold text-white">{h.step}</div>
              <h3 className="font-bold text-white">{h.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{h.body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      <Section>
        <GlassCard className="text-center sm:p-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Ready to apply?</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Email your CV or portfolio and tell us why you&apos;re excited. We read every application.
          </p>
          <div className="mt-7 flex justify-center">
            <PrimaryButton href={`mailto:${CAREERS_EMAIL}`}>{CAREERS_EMAIL}</PrimaryButton>
          </div>
        </GlassCard>
      </Section>
    </>
  );
}
