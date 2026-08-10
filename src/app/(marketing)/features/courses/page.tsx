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
  GhostButton,
  BadgePill,
} from "@/components/marketing/ui";
import { COMPANY_NAME } from "@/config/company";

export const metadata: Metadata = {
  title: "Online Courses — Learn Skills or Teach & Earn",
  description: `Take expert-led courses and earn certificates on ${COMPANY_NAME}, or become a tutor and sell your own courses and live classes to students worldwide.`,
};

const STATS = [
  { value: "Certificates", label: "Earn on completion" },
  { value: "Live", label: "Interactive classes" },
  { value: "Anywhere", label: "Learn on any device" },
  { value: "Yours", label: "Tutors own the curriculum" },
];

const LEARNER = [
  { icon: BookOpen, title: "Expert-led courses", body: "Structured video lessons across skills, business, tech, and creative topics — added continuously." },
  { icon: Award, title: "Recognized certificates", body: "Finish a course and earn a verifiable certificate you can share on your profile and CV." },
  { icon: Video, title: "Live classes", body: "Join scheduled live sessions, ask questions in real time, and learn directly from tutors." },
  { icon: Clock, title: "Learn at your pace", body: "Start, pause, and resume anytime. Your progress is saved across every device." },
];

const STEPS = [
  { icon: Handshake, title: "Apply to teach", body: "Tell us about your expertise. Once approved, your tutor console unlocks." },
  { icon: PenTool, title: "Build your course", body: "Add video lessons, resources, quizzes, and set your price with our course builder." },
  { icon: Rocket, title: "Publish & go live", body: "Launch your course to a global audience and schedule live classes whenever you like." },
  { icon: Wallet, title: "Earn on every enrollment", body: "Get paid for each student who enrolls — earnings flow straight to your wallet." },
];

const TUTOR = [
  { icon: Wallet, title: "Set your own price", body: "You decide what your course is worth. Run discounts and promotions whenever you want." },
  { icon: Globe2, title: "Reach students worldwide", body: "Sell to learners across 180+ countries — your classroom is never closed." },
  { icon: Handshake, title: "Affiliate promotion", body: "Let affiliates promote your course for a commission and grow enrollments hands-free." },
];

export default function CoursesFeaturePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-amber-500/10 to-transparent"
        />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-16 pb-10 sm:pt-24 sm:pb-14">
          <div className="mb-5">
            <BadgePill>Courses & Learning</BadgePill>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-(--mk-text) tracking-tight leading-[1.1]">
            Learn new skills, or{" "}
            <span className="bg-linear-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
              teach and earn
            </span>
          </h1>
          <p className="mt-6 text-lg text-(--mk-muted) leading-relaxed max-w-2xl mx-auto">
            Take expert-led courses and earn recognized certificates — or become
            a tutor and turn your knowledge into income with your own courses and
            live classes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <PrimaryButton href="/register">
              <GraduationCap className="h-4 w-4" /> Start learning
            </PrimaryButton>
            <GhostButton href="/profile/become-tutor">Become a tutor →</GhostButton>
          </div>
        </div>
      </section>

      <Section className="bg-(--mk-band)">
        <StatGrid stats={STATS} />
      </Section>

      {/* For learners */}
      <Section>
        <SectionHeading
          badge="For learners"
          title="Everything you need to grow your skills"
          subtitle="Learn from real experts, at your own pace, and walk away with proof you can show."
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
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-fuchsia-600 hover:text-fuchsia-700"
          >
            See how affiliates can promote your course <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </Section>

      {/* Final CTA */}
      <Section>
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-amber-500 to-orange-600 p-8 sm:p-12 text-center shadow-xl shadow-orange-500/20">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Start learning — or start teaching
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-orange-50">
            Join free today. Take your first course in minutes, or apply to
            become a tutor and open your own classroom.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-orange-700 hover:bg-orange-50 transition-colors shadow-sm"
            >
              <Users className="h-4 w-4" /> Create free account
            </Link>
            <Link
              href="/profile/become-tutor"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/40 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Become a tutor →
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
