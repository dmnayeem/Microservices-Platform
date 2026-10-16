import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Medal,
  Megaphone,
  Share2,
  Store,
  Target,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Section, SectionHeading, GlassCard, PrimaryButton, GhostButton, MarketingHero, CtaBand } from "@/components/marketing/ui";
import { COMPANY_NAME } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";
import { PROGRAMS, PROGRAM_KEYS, applyHrefFor, type ProgramIcon } from "@/lib/application-requirements";
import { effectiveRequirements, getRequirementsConfig } from "@/lib/application-requirements-server";

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Programs — Sell, Offer Services, Advertise, Teach",
    description: `Every program on ${COMPANY_NAME} in one place: marketplace seller, service provider, task buyer, advertiser, agency, affiliate, tutor, ambassador and the blue badge. See what you get and apply.`,
    path: "/programs",
  });
}

const ICONS: Record<ProgramIcon, LucideIcon> = {
  store: Store,
  briefcase: Briefcase,
  target: Target,
  megaphone: Megaphone,
  building: Building2,
  share: Share2,
  graduation: GraduationCap,
  medal: Medal,
  badge: BadgeCheck,
};

const STEPS = [
  { icon: UserPlus, title: "Create a free account", body: "Sign up or sign in — every program starts from your account." },
  { icon: ClipboardCheck, title: "Check the requirements", body: "Each program shows what it needs and which parts you already meet." },
  { icon: CheckCircle2, title: "Apply and get reviewed", body: "Our team reviews your application and emails you the decision." },
];

export default async function ProgramsPage() {
  const cfg = await getRequirementsConfig().catch(() => null);
  const programs = await Promise.all(
    PROGRAM_KEYS.map(async (key) => {
      const req = cfg ? await effectiveRequirements(key, cfg).catch(() => null) : null;
      return { ...PROGRAMS[key], open: req?.enabled !== false, note: req?.note ?? "" };
    })
  );
  const open = programs.filter((p) => p.open);

  return (
    <>
      <MarketingHero
        badge="Programs"
        title="More ways to work with us —"
        highlight="pick your program"
        subtitle="Sell digital products, offer your services, pay people to do a job, run ads, teach a course, bring in members as an ambassador, or get the verified blue badge. One account, one place to apply."
        actions={
          <>
            <PrimaryButton href="/apply">
              Apply now <ArrowRight className="h-4 w-4" />
            </PrimaryButton>
            <GhostButton href="/register">Create free account →</GhostButton>
          </>
        }
      />

      <Section>
        <SectionHeading badge="Programs" tone="purple" title="Choose what fits you" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((p) => {
            const Icon = ICONS[p.icon];
            return (
              <GlassCard key={p.key} className="flex flex-col">
                <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) shadow-sm">
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-(--mk-text)">{p.label}</h3>
                <p className="mt-1.5 text-sm text-(--mk-muted) leading-relaxed">{p.blurb}</p>
                <ul className="mt-3 space-y-1.5">
                  {p.benefits.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-(--mk-muted)">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-(--mk-accent)" />
                      {b}
                    </li>
                  ))}
                </ul>
                {p.note && <p className="mt-3 text-xs text-(--mk-subtle)">{p.note}</p>}
                <div className="mt-auto pt-5">
                  <Link
                    href={applyHrefFor(p.key)}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-(--mk-accent) hover:underline"
                  >
                    {p.key === "BLUE_BADGE" ? "Get the badge" : "Apply"} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </Section>

      <Section className="bg-(--mk-band)">
        <SectionHeading badge="How it works" tone="emerald" title="Three steps to get started" />
        <div className="grid gap-4 sm:grid-cols-3">
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

      <Section>
        <CtaBand
          title="Ready to apply?"
          subtitle="Sign in to see each program's requirements, where your application stands, and apply in a minute."
          primary={{ href: "/apply", label: <>Go to applications <ArrowRight className="h-4 w-4" /></> }}
          secondary={{ href: "/register", label: "Create free account →" }}
        />
      </Section>
    </>
  );
}
