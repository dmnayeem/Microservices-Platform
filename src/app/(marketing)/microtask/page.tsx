import type { Metadata } from "next";
import {
  ClipboardList,
  Share2,
  Video,
  FileText,
  Brain,
  Smartphone,
  Globe,
  Gift,
  Flame,
  Trophy,
  MessageSquare,
  ShieldCheck,
  Wallet,
  Gamepad2,
  Ticket,
  CheckCircle2,
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
import { SOCIAL_PLATFORMS } from "@/lib/social-tasks";
import { BUYER_TASK_TYPES, BUYER_TASK_TYPE_META } from "@/lib/buyer-task-types";
import { COMPANY_NAME } from "@/config/company";

/**
 * Public explainer for the micro-task side of the platform.
 *
 * Every figure on this page is COMPUTED from the modules that define the thing
 * being counted — the social catalog, the buyer task-type list — never typed in
 * as a literal. A marketing page that hardcodes "40 platforms" is wrong the
 * first time someone adds the forty-first, and nobody re-reads a marketing page
 * when they edit a catalog.
 *
 * Rates are deliberately absent. Every reward on this platform is an
 * admin-configurable setting (points per task, points per dollar, the
 * withdrawal fee); printing today's number on a public page promises a figure
 * the owner can change in the admin panel five minutes later.
 */

const PLATFORM_COUNT = SOCIAL_PLATFORMS.length;
const ACTION_COUNT = SOCIAL_PLATFORMS.reduce((n, p) => n + p.actions.length, 0);

export function generateMetadata(): Metadata {
  const title = "Micro Tasks — Every Small Job You Can Get Paid For";
  const description =
    `See every kind of micro task on ${COMPANY_NAME}: social actions across ` +
    `${PLATFORM_COUNT} platforms, video watching, surveys, articles, quizzes, ` +
    `app installs, offerwalls and daily missions — and exactly how each one pays.`;
  return {
    title,
    description,
    alternates: { canonical: "/microtask" },
    openGraph: {
      title,
      description,
      url: "/microtask",
      type: "website",
      siteName: COMPANY_NAME,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** The task types on the platform, as the TaskType enum actually defines them. */
const TASK_TYPES = [
  {
    icon: Share2,
    title: "Social actions",
    body: `Follow, like, share, comment, subscribe, review or post — ${ACTION_COUNT} distinct actions across ${PLATFORM_COUNT} platforms, each with its own proof rules.`,
  },
  {
    icon: Video,
    title: "Watch a video",
    body: "Watch for a set time. Watch time is measured on the server from real playback heartbeats, not claimed by the viewer.",
  },
  {
    icon: FileText,
    title: "Read an article",
    body: "Open a page, stay on it for the required time, and answer what it asked. Reading time is tracked, not self-reported.",
  },
  {
    icon: ClipboardList,
    title: "Surveys",
    body: "Answer a set of questions. The buyer sees every answer and never who gave it — you are told that before you start.",
  },
  {
    icon: Brain,
    title: "Quizzes",
    body: "Answer questions against a time limit. The answer key stays on the server, so a quiz is worth taking honestly.",
  },
  {
    icon: Smartphone,
    title: "App installs",
    body: "Install an app and complete the steps the task asks for. Each task states exactly which proof it needs before you begin.",
  },
  {
    icon: CheckCircle2,
    title: "Custom tasks",
    body: "Anything that does not fit a box. The buyer writes the steps, you follow them, and a human reviews the proof.",
  },
  {
    icon: Globe,
    title: "Offerwalls",
    body: "Curated offers from partner networks. Completion is confirmed by the provider's own server callback, then credited to you.",
  },
];

/** Earning surfaces that are not a task row. */
const MORE_WAYS = [
  {
    icon: Globe,
    title: "Browse & Earn",
    body: "A passive surface: ads rotate, you keep the page in view, and each rotation is a paid impression. No proof to submit.",
  },
  {
    icon: Flame,
    title: "Daily missions",
    body: "A short list that resets every day. Claim it to keep your streak — the streak is also what several bonuses are gated on.",
  },
  {
    icon: Trophy,
    title: "Events & quests",
    body: "Time-boxed goals with their own progress counter. Progress moves forward only, so it can never be reset out from under you.",
  },
  {
    icon: MessageSquare,
    title: "Social feed",
    body: "Post, comment and engage in the feed. Feed earning is governed by your ratio of genuine activity to rewards, not by raw volume.",
  },
  {
    icon: Gamepad2,
    title: "Games & tournaments",
    body: "HTML5 games, quiz competitions, lotteries and prize draws, each with its own entry rules and prize pool.",
  },
  {
    icon: Ticket,
    title: "Achievements & milestones",
    body: "Long-run goals that pay once when you reach them. They are checked against your real history, not a counter you can nudge.",
  },
];

const HOW = [
  {
    n: 1,
    title: "Pick a task",
    body: "Every task shows what it pays, what proof it needs and how long you have, before you open it.",
  },
  {
    n: 2,
    title: "Do the work",
    body: "Follow the steps exactly. Video and article tasks track time on the server; social tasks tell you what to screenshot.",
  },
  {
    n: 3,
    title: "Submit proof",
    body: "Upload the screenshot or paste the link the task asked for. Some tasks verify your link automatically within seconds.",
  },
  {
    n: 4,
    title: "Get paid",
    body: "Approved work credits your balance once and only once. Points convert to cash in your wallet, and cash is what you withdraw.",
  },
];

const FAIRNESS = [
  {
    icon: ShieldCheck,
    title: "One credit per submission",
    body: "Every payout is written against a unique reference, so an approval that runs twice pays once. This is enforced in the ledger, not by a screen.",
  },
  {
    icon: CheckCircle2,
    title: "Automatic checks never auto-reject",
    body: "When a link can be fetched and matched, approval is instant. When it cannot be read, it goes to a human — a failed read is never treated as a failed task.",
  },
  {
    icon: Gift,
    title: "Targeted, not wasted",
    body: "Tasks are matched to country, region and profile, so the list you see is work you are actually eligible to complete.",
  },
];

export default function MicroTaskPage() {
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
            <BadgePill tone="blue">Micro Tasks</BadgePill>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-(--mk-text) tracking-tight leading-[1.1]">
            {/* Not "paid the same day". Approval turnaround is per task —
                some auto-approve, some wait for a human — so a same-day promise
                on a public page is one the platform has no code to keep. What
                IS true of every task is that the reward is stated before you
                start, so that is what the headline says. */}
            Small jobs,{" "}
            <span className="bg-linear-to-r from-(--mk-rail-a) to-(--mk-rail-b) bg-clip-text text-transparent">
              and you know the pay before you start
            </span>
          </h1>
          <p className="mt-6 text-lg text-(--mk-muted) leading-relaxed max-w-2xl mx-auto">
            A micro task is a job that takes a minute or two — follow a page,
            watch a video, answer a survey, install an app. {COMPANY_NAME} runs
            eight kinds of them, plus half a dozen ways to earn that are not
            tasks at all. Here is all of it, in plain language.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <PrimaryButton href="/register">
              <ClipboardList className="h-4 w-4" /> Start earning free
            </PrimaryButton>
            <GhostButton href="/advertise">Need work done instead? →</GhostButton>
          </div>
        </div>
      </section>

      <Section className="bg-(--mk-band)">
        <StatGrid
          stats={[
            { value: String(TASK_TYPES.length), label: "Kinds of micro task" },
            { value: String(PLATFORM_COUNT), label: "Social platforms covered" },
            { value: String(ACTION_COUNT), label: "Distinct social actions" },
            { value: "Daily", label: "New tasks and missions" },
          ]}
        />
      </Section>

      {/* Task types */}
      <Section>
        <div id="task-types" className="scroll-mt-24" />
        <SectionHeading
          badge="What you can do"
          tone="blue"
          title="Eight kinds of micro task"
          subtitle="Each type asks for different work and different proof. Every task tells you which before you start it."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TASK_TYPES.map((t) => (
            <GlassCard key={t.title}>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--mk-accent)/10 border border-(--mk-accent)/20">
                <t.icon className="h-5 w-5 text-(--mk-accent)" />
              </div>
              <h3 className="text-base font-bold text-(--mk-text)">{t.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-(--mk-muted)">
                {t.body}
              </p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* Social catalog */}
      <Section className="bg-(--mk-band)">
        <div id="social" className="scroll-mt-24" />
        <SectionHeading
          badge="Social tasks"
          tone="purple"
          title={`${PLATFORM_COUNT} platforms, ${ACTION_COUNT} actions`}
          subtitle="The social catalog is the biggest single source of work on the platform. These are the platforms it covers today."
        />
        <div className="flex flex-wrap justify-center gap-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <span
              key={p.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-(--mk-border) bg-(--mk-surface) px-3 py-2 text-sm font-medium text-(--mk-text)"
            >
              <span aria-hidden>{p.emoji}</span>
              {p.label}
              <span className="text-xs font-semibold text-(--mk-accent)">
                {p.actions.length}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-(--mk-subtle)">
          The number beside each platform is how many different actions it
          offers. Which platforms are open at any moment is set by an
          administrator.
        </p>
      </Section>

      {/* How it works */}
      <Section>
        <SectionHeading
          badge="How it works"
          tone="blue"
          title="From task to payout in four steps"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map((s) => (
            <GlassCard key={s.n} className="relative pt-8">
              <span className="absolute -top-3 left-6 inline-flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) text-sm font-extrabold text-white shadow-sm">
                {s.n}
              </span>
              <h3 className="text-base font-bold text-(--mk-text)">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-(--mk-muted)">
                {s.body}
              </p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* Other earning surfaces */}
      <Section className="bg-(--mk-band)">
        <div id="more-ways" className="scroll-mt-24" />
        <SectionHeading
          badge="Beyond tasks"
          tone="emerald"
          title="Six more ways to earn"
          subtitle="Not everything that pays is a task. These run alongside the task list."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MORE_WAYS.map((m) => (
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
        <div id="feed" className="scroll-mt-24" />
      </Section>

      {/* Fairness */}
      <Section>
        <SectionHeading
          badge="How we keep it fair"
          tone="blue"
          title="Paid once, judged by a human when it matters"
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

      {/* Payout */}
      <Section className="bg-(--mk-band)" width="narrow">
        <div id="payout" className="scroll-mt-24" />
        <SectionHeading
          badge="Getting paid"
          tone="emerald"
          title="Points in, cash out"
          subtitle="Tasks pay points. Points convert to cash in your wallet, and withdrawals are made from the cash balance."
        />
        <GlassCard>
          <ul className="space-y-3 text-sm leading-relaxed text-(--mk-muted)">
            <li className="flex gap-3">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-(--mk-success)" />
              <span>
                One wallet holds both balances. You convert points to cash
                yourself, at the rate shown in the app at the time you convert.
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-(--mk-success)" />
              <span>
                Withdrawal methods, minimums, maximums and any fee are set by
                the administrator and shown to you on the withdrawal screen
                before you confirm — this page will never quote you a figure
                that could be out of date.
              </span>
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-(--mk-success)" />
              <span>
                Identity verification is required before a payout. One verified
                identity belongs to one account.
              </span>
            </li>
          </ul>
        </GlassCard>
        <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
          <PrimaryButton href="/register">Create your free account</PrimaryButton>
          <GhostButton href="/referral">Earn by inviting people →</GhostButton>
        </div>
      </Section>

      {/* Buyer cross-link */}
      <Section width="narrow">
        <GlassCard className="text-center">
          <h2 className="text-xl font-bold text-(--mk-text)">
            Want these tasks done for you?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-(--mk-muted)">
            Buyers can create{" "}
            {BUYER_TASK_TYPES.map((t, i) => (
              <span key={t}>
                {i > 0 && (i === BUYER_TASK_TYPES.length - 1 ? " and " : ", ")}
                <span className="font-semibold text-(--mk-accent)">
                  {BUYER_TASK_TYPE_META[t].label.toLowerCase()}
                </span>
              </span>
            ))}{" "}
            tasks and have real people complete them.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <PrimaryButton href="/advertise">See advertising options</PrimaryButton>
          </div>
        </GlassCard>
      </Section>
    </>
  );
}
