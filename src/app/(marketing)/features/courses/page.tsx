import type { Metadata } from "next";
import Link from "next/link";
import {
  GraduationCap,
  Award,
  Video,
  Clock,
  BookOpen,
  Users,
  Wallet,
  Handshake,
  PenTool,
  Rocket,
  Globe2,
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
    title: "Online Courses — Learn Skills or Teach & Earn",
    description: `Take structured online courses with completion certificates on ${COMPANY_NAME}, or apply as a tutor to build and sell your own courses and live classes.`,
    path: "/features/courses",
  });
}

const STATS = [
  { value: "Certificates", label: "Earn on completion" },
  { value: "Live", label: "Interactive classes" },
  { value: "Anywhere", label: "Learn on any device" },
  { value: "Yours", label: "Tutors own the curriculum" },
];

const LEARNER = [
  { icon: BookOpen, title: "Tutor-built courses", body: "Structured video lessons, resources and quizzes on practical skills — business, tech, creative work and more — built by approved tutors." },
  { icon: Award, title: "Completion certificates", body: "Finish a course that offers one and receive a certificate you can share on your profile and CV." },
  { icon: Video, title: "Live classes", body: "Join scheduled live sessions, ask questions in real time, and learn directly from tutors." },
  { icon: Clock, title: "Learn at your pace", body: "Start, pause, and resume anytime. Your progress is saved across every device." },
];

const STEPS = [
  { icon: Handshake, title: "Apply to teach", body: "Tell us about your subject and experience. Once your application is approved, your tutor console unlocks." },
  { icon: PenTool, title: "Build your course", body: "Add video lessons, resources, quizzes, and set your price with our course builder." },
  { icon: Rocket, title: "Publish & go live", body: "Publish your course to learners on the platform and schedule live classes when it suits you." },
  { icon: Wallet, title: "Earn on every enrollment", body: "Get paid for each student who enrolls — earnings flow straight to your wallet." },
];

const TUTOR = [
  { icon: Wallet, title: "Set your own price", body: "You decide what your course is worth. Run discounts and promotions whenever you want." },
  { icon: Globe2, title: "Learners on the platform", body: "Your course is listed alongside the micro-task and marketplace community already using RevType, and learners can study at any hour." },
  { icon: Handshake, title: "Affiliate promotion", body: "Let affiliates promote your course for a commission and grow enrollments hands-free." },
];

export default function CoursesFeaturePage() {
  return (
    <>
      <MarketingHero
        badge="Courses & Learning"
        title="Learn new skills, or"
        highlight="teach and earn"
        subtitle="Take a course and earn a completion certificate — or apply as a tutor and sell your own courses and live classes."
        actions={
          <>
            <PrimaryButton href="/register">
              <GraduationCap className="h-4 w-4" /> Start learning
            </PrimaryButton>
            <GhostButton href="/profile/become-tutor">Become a tutor →</GhostButton>
          </>
        }
      />

      <Section className="bg-(--mk-band)">
        <StatGrid stats={STATS} />
      </Section>

      {/* For learners */}
      <Section>
        <SectionHeading
          badge="For learners"
          title="Everything you need to grow your skills"
          subtitle="Learn from approved tutors, at your own pace, and come away with a certificate you can show."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LEARNER.map((c) => (
            <GlassCard key={c.title}>
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-amber-500 to-orange-600 shadow-sm">
                <c.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-(--mk-text)">{c.title}</h3>
              <p className="mt-2 text-sm text-(--mk-muted) leading-relaxed">{c.body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* Become a tutor */}
      <Section className="bg-(--mk-band)">
        <SectionHeading
          badge="Become a tutor"
          tone="purple"
          title="Turn what you know into income"
          subtitle="Approved tutors get a full console to build, publish, and sell courses and live classes."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <GlassCard key={s.title} className="relative pt-8">
              <span className="absolute -top-3 left-6 inline-flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-amber-500 to-orange-600 text-sm font-extrabold text-white shadow-sm">
                {i + 1}
              </span>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                <s.icon className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-bold text-(--mk-text)">{s.title}</h3>
              <p className="mt-1.5 text-sm text-(--mk-muted) leading-relaxed">{s.body}</p>
            </GlassCard>
          ))}
        </div>
        <div className="mt-8 text-center">
          <PrimaryButton href="/profile/become-tutor">
            <GraduationCap className="h-4 w-4" /> Apply to become a tutor
          </PrimaryButton>
        </div>
      </Section>

      {/* Tutor benefits */}
      <Section>
        <SectionHeading
          badge="Why teach here"
          tone="emerald"
          title="Built for creators who teach"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {TUTOR.map((b) => (
            <GlassCard key={b.title}>
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 shadow-sm">
                <b.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-(--mk-text)">{b.title}</h3>
              <p className="mt-2 text-sm text-(--mk-muted) leading-relaxed">{b.body}</p>
            </GlassCard>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link
            href="/features/affiliate"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--mk-accent) hover:text-(--mk-accent)"
          >
            See how affiliates can promote your course <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </Section>

      {/* Final CTA */}
      <Section>
        <CtaBand
          title="Start learning — or start teaching"
          subtitle={
            <>
              Joining is free. Enrol in your first course, or apply to become a tutor and open your own classroom.
              Questions? See the <Link href="/help">Help Center</Link>.
            </>
          }
          primary={{ href: "/register", label: <><Users className="h-4 w-4" /> Create free account</> }}
          secondary={{ href: "/profile/become-tutor", label: "Become a tutor →" }}
        />
      </Section>
    </>
  );
}
