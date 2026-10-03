import type { Metadata } from "next";
import Link from "next/link";
import { Code2, ShieldCheck, Headphones, PenLine, Mail } from "lucide-react";
import {
  MarketingHero,
  Section,
  SectionHeading,
  GlassCard,
  PrimaryButton,
} from "@/components/marketing/ui";
import { COMPANY_NAME, CAREERS_EMAIL } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Careers",
    description: `Work with ${COMPANY_NAME}, a freelance micro-task marketplace and digital skill-sharing community. How to get in touch about future roles.`,
    path: "/careers",
  });
}

/*
 * There are no open positions to advertise. The page used to list six roles
 * and a benefits package (equity, health cover, a learning budget) that were
 * placeholders, not real offers — a job advert that is not real misleads the
 * people who apply. List a role here only when it is actually open.
 */
const AREAS = [
  { icon: Code2, title: "Engineering", body: "The web app, the task and verification engine, payouts, and the marketplace and course systems." },
  { icon: ShieldCheck, title: "Trust & safety", body: "Reviewing task proof, catching fraud and fake accounts, and keeping the marketplace clean." },
  { icon: Headphones, title: "Member support", body: "Helping members, sellers, tutors and advertisers by email and in-app tickets." },
  { icon: PenLine, title: "Content & community", body: "Guides for the blog and Help Center, and looking after the creator community." },
];

export default function CareersPage() {
  return (
    <>
      <MarketingHero
        badge="Careers"
        title="Work on"
        highlight={COMPANY_NAME}
        subtitle={`${COMPANY_NAME} is a freelance micro-task marketplace and digital skill-sharing community. We do not have open positions listed right now, but we are always glad to hear from people who want to help build it.`}
      />

      <Section width="narrow">
        <GlassCard className="sm:p-8">
          <h2 className="text-xl font-bold text-(--mk-text)">No open roles at the moment</h2>
          <p className="mt-3 text-sm leading-relaxed text-(--mk-muted)">
            When a position opens it will be listed on this page with its responsibilities, location and type. Until then, you are welcome to send a short introduction and your CV or portfolio — tell us which area below interests you and what you would bring to it. We keep promising introductions on file for future roles.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-(--mk-muted)">
            New to the platform? Read{" "}
            <Link href="/about" className="font-semibold text-(--mk-accent) hover:underline">about {COMPANY_NAME}</Link>{" "}
            and{" "}
            <Link href="/microtask" className="font-semibold text-(--mk-accent) hover:underline">how micro-tasks work</Link>{" "}
            first.
          </p>
        </GlassCard>
      </Section>

      <Section>
        <SectionHeading badge="Where help is needed" tone="purple" title="Areas of work" subtitle="The kinds of work that keep the platform running." />
        <div className="grid gap-4 sm:grid-cols-2">
          {AREAS.map((p) => (
            <GlassCard key={p.title}>
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b)">
                <p.icon className="h-5 w-5 text-white" aria-hidden />
              </div>
              <h3 className="text-lg font-bold text-(--mk-text)">{p.title}</h3>
              <p className="mt-2 text-sm text-(--mk-muted) leading-relaxed">{p.body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      <Section>
        <GlassCard className="text-center sm:p-12">
          <div className="mb-3 inline-flex items-center gap-2 text-(--mk-accent)">
            <Mail className="h-5 w-5" aria-hidden /><span className="text-sm font-bold uppercase tracking-wider">Get in touch</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-(--mk-text)">Send an introduction</h2>
          <p className="mx-auto mt-3 max-w-xl text-(--mk-muted)">
            Email your CV or portfolio with the area you are interested in as the subject.
          </p>
          <div className="mt-7 flex justify-center">
            <PrimaryButton href={`mailto:${CAREERS_EMAIL}`}>{CAREERS_EMAIL}</PrimaryButton>
          </div>
        </GlassCard>
      </Section>
    </>
  );
}
