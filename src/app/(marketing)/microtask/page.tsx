import type { Metadata } from "next";
import Link from "next/link";
import { Flame, Trophy, MessageSquare, Gamepad2, Medal } from "lucide-react";
import {
  PageHero,
  Band,
  SectionHead,
  Facts,
  Rows,
  Steps,
  Tile,
  Btn,
  Faq,
  Closing,
  Marquee,
} from "@/components/marketing/kit";
import { MicrotaskMock, PlatformMark } from "@/components/marketing/mocks";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbLd } from "@/lib/seo/breadcrumbs";
import { SOCIAL_PLATFORMS } from "@/lib/social-tasks";
import { COMPANY_NAME } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";

/**
 * Public explainer for the micro-task side of the platform.
 *
 * Every count on this page is COMPUTED from the module that defines the thing
 * being counted — the social catalog, the task-type list — never typed in as
 * a literal: a page that hardcodes "40 platforms" is wrong the first time
 * someone adds the forty-first.
 *
 * Rates are deliberately absent. Every reward is an admin setting (points per
 * task, points per dollar, the withdrawal fee); printing today's number here
 * promises a figure the owner can change five minutes later. The hero mock's
 * figures are labelled "Example" for the same reason.
 */

const PLATFORM_COUNT = SOCIAL_PLATFORMS.length;
const ACTION_COUNT = SOCIAL_PLATFORMS.reduce((n, p) => n + p.actions.length, 0);

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Micro-Tasks — Small Online Jobs That Pay",
    // ≤155 chars — what Google shows uncut.
    description:
      `Earn from short online jobs on ${COMPANY_NAME}: social tasks on ${PLATFORM_COUNT} platforms, ` +
      `surveys, videos and app tests. Reward shown up front, work verified.`,
    path: "/microtask",
  });
}

/** The task types, as the TaskType enum defines them — with the proof each one takes. */
const TASK_TYPES = [
  {
    title: "Social actions",
    body: `Follow, like, comment, subscribe, review or post — ${ACTION_COUNT} actions across ${PLATFORM_COUNT} platforms.`,
    meta: "Link or screenshot",
  },
  {
    title: "Video tasks",
    body: "Watch a set video for the time the task asks, then complete its steps. Watch time is measured from real playback.",
    meta: "Measured watch time",
  },
  {
    title: "Read an article",
    body: "Open a page, stay for the time required and answer what it asks. Reading time is tracked, not self-reported.",
    meta: "Time on page + answer",
  },
  {
    title: "Surveys",
    body: "Answer a short set of questions. The business sees your answers, never your name.",
    meta: "Your answers",
  },
  {
    title: "Quizzes",
    body: "Beat the clock on a few questions. The answer key never leaves the server.",
    meta: "Scored on the server",
  },
  {
    title: "App installs",
    body: "Install an app and complete the steps listed. Each task says exactly what proof it needs.",
    meta: "Steps + screenshot",
  },
  {
    title: "Custom tasks",
    body: "Work that doesn't fit a box. The business writes the steps; a person reviews what you send.",
    meta: "Human review",
  },
  {
    title: "Offerwalls",
    body: "Offers from partner networks, credited once the partner confirms you completed them.",
    meta: "Partner confirmation",
  },
];

const STEPS = [
  { title: "Pick a task", body: "See the reward, the proof it needs and the time limit before you open it." },
  { title: "Do the work", body: "Follow the steps. Video and reading time is tracked for you." },
  { title: "Send proof", body: "Paste the link or upload the screenshot. Many links are checked in seconds." },
  { title: "Get paid", body: "Approved work adds points to your wallet. Convert them to cash and withdraw." },
];

const MORE_WAYS = [
  { icon: Flame, title: "Daily missions", body: "A short list that resets every day and keeps your streak alive." },
  { icon: Trophy, title: "Events & quests", body: "Time-boxed goals whose progress only ever moves forward." },
  { icon: MessageSquare, title: "Social feed", body: "Post and take part. Rewards follow genuine activity, not volume." },
  { icon: Gamepad2, title: "Games & tournaments", body: "HTML5 games, quiz contests and prize draws with their own rules." },
  { icon: Medal, title: "Achievements", body: "Long-run milestones that pay once, checked against your real history." },
];

const FAQ = [
  {
    q: `Is ${COMPANY_NAME} free to join?`,
    a: "Yes. Creating an account is free and needs no card. Some withdrawal options can require an active plan — when they do, the withdrawal screen tells you before you ask for a payout.",
  },
  {
    q: "How much does a task pay?",
    a: "Every task shows its reward before you open it. Rewards differ from task to task and can change over time, so we don't quote figures here.",
  },
  {
    q: "How is my work checked?",
    a: "Links that can be opened are matched automatically, often within seconds. Anything that can't be read goes to a person — a failed read never counts as a failed task.",
  },
  {
    q: "How do I get my money?",
    a: "Approved work adds points to your wallet. You convert points to cash at the rate shown in the app, then withdraw with the methods, minimums and fees shown on the withdrawal screen. Larger withdrawals need identity verification.",
  },
  {
    q: "Do I get paid for watching ads?",
    a: `No. ${COMPANY_NAME} pays for tasks with proof, never for viewing ads.`,
  },
  {
    q: "Why can't I see some tasks?",
    a: "Tasks are matched to country, region and profile, so your list only shows work you can actually complete.",
  },
];

export default function MicroTaskPage() {
  // Two rows of logos moving at different speeds read as a living catalogue.
  const half = Math.ceil(SOCIAL_PLATFORMS.length / 2);
  const rows = [SOCIAL_PLATFORMS.slice(0, half), SOCIAL_PLATFORMS.slice(half)];

  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Micro-tasks", path: "/microtask" }])} />

      <PageHero
        kicker="Micro-tasks"
        title="Small online jobs."
        accent="The pay is clear before you start."
        lead="Follow a page, test an app, answer a survey, review a video. Each task shows its reward and the proof it needs up front, and approved work goes straight to your wallet."
        actions={
          <>
            <Btn href="/register">Create a free account</Btn>
            <Btn href="/advertise" variant="secondary">
              Hire people for tasks
            </Btn>
          </>
        }
        note="Free to join · No card needed"
        visual={<MicrotaskMock />}
      />

      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <Facts
          items={[
            { value: String(TASK_TYPES.length), label: "Kinds of task" },
            { value: String(PLATFORM_COUNT), label: "Social platforms" },
            { value: String(ACTION_COUNT), label: "Social actions" },
            { value: "Up front", label: "Reward and proof shown" },
          ]}
        />
      </div>

      <Band id="task-types" labelledBy="task-types-title">
        <SectionHead
          id="task-types-title"
          n="01"
          label="Task types"
          title={`${TASK_TYPES.length} kinds of work, each with its own proof`}
          lead="Tasks come from businesses, advertisers and partner networks. You always know what's being asked before you accept."
        />
        <Rows items={TASK_TYPES} />
      </Band>

      <Band id="social" labelledBy="social-title" alt>
        <SectionHead
          id="social-title"
          n="02"
          label="Social tasks"
          title={`${PLATFORM_COUNT} platforms. ${ACTION_COUNT} actions.`}
          lead="The largest single source of work on the platform. Which platforms are open at any moment is set by our team."
        />
        <div className="space-y-3">
          {rows.map((row, i) => (
            <Marquee key={i} seconds={i === 0 ? 70 : 85}>
              {row.map((p) => (
                <span
                  key={p.key}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-(--mk-border) bg-(--mk-surface) px-4 py-2.5 text-sm font-medium text-(--mk-text)"
                >
                  <PlatformMark brand={p.key} label={p.label} />
                  {p.label}
                  <span className="text-xs text-(--mk-subtle)">{p.actions.length}</span>
                </span>
              ))}
            </Marquee>
          ))}
        </div>
        <p className="mt-6 text-sm text-(--mk-subtle)">The number beside each platform is how many different actions it offers.</p>
      </Band>

      <Band labelledBy="how-title">
        <SectionHead id="how-title" n="03" label="How it works" title="From task to payout in four steps" />
        <Steps items={STEPS} />
      </Band>

      <Band id="payout" labelledBy="fair-title" alt>
        <SectionHead
          id="fair-title"
          n="04"
          label="Fair by design"
          title="Checked carefully. Paid once."
          lead="The rules that decide whether you're paid are written into the platform, not left to a screen."
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Tile
            title="One credit per submission"
            body="Every payout carries a unique reference, so an approval can never pay twice or go missing."
          />
          <Tile
            title="A failed read goes to a person"
            body="When a link can't be opened, a reviewer looks at it. It is never rejected just because a check couldn't run."
          />
          <Tile
            title="Only tasks you qualify for"
            body="Tasks are matched to your country, region and profile, so you don't waste time on work you can't finish."
          />
          <Tile
            className="md:col-span-2 lg:col-span-3"
            title="Points in, cash out"
            body={
              <>
                Approved work pays points. You convert them to cash in your wallet at the rate shown in the app, then withdraw.
                Methods, minimums and any fee are shown on the withdrawal screen before you confirm, and larger withdrawals need
                identity verification. Earnings are never guaranteed — see the <Link href="/help" className="font-semibold text-(--mk-accent) hover:underline">Help Center</Link>.
              </>
            }
            visual={
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {["Task approved", "Points", "Cash balance", "Withdrawal"].map((s, i, a) => (
                  <span key={s} className="flex items-center gap-2">
                    <span className="rounded-full border border-(--mk-border) bg-(--mk-surface-2) px-3 py-1.5 font-medium text-(--mk-text)">
                      {s}
                    </span>
                    {i < a.length - 1 && <span aria-hidden className="h-px w-5 bg-(--mk-border-strong)" />}
                  </span>
                ))}
              </div>
            }
          />
        </div>
      </Band>

      <Band id="more-ways" labelledBy="more-title">
        <SectionHead
          id="more-title"
          n="05"
          label="Beyond tasks"
          title={`${MORE_WAYS.length} more ways to earn`}
          lead="Not everything that pays is a task. These run alongside your task list."
        />
        <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
          {MORE_WAYS.map((m) => (
            <li key={m.title} id={m.title === "Social feed" ? "feed" : undefined} className="mkx-step mkx-reveal scroll-mt-24">
              <m.icon aria-hidden className="h-5 w-5 text-(--mk-accent)" />
              <h3 className="mkx-h3 mt-4">{m.title}</h3>
              <p className="mkx-body mt-2">{m.body}</p>
            </li>
          ))}
        </ul>
      </Band>

      <Band labelledBy="other-title" alt>
        <SectionHead id="other-title" n="06" label="Other sides of RevType" title="On the other side of the task" />
        <div className="grid gap-4 md:grid-cols-3">
          <Tile
            href="/advertise"
            cta="Advertise"
            title="Need work done?"
            body="Create tasks, fund them up front and review what comes back from real people."
          />
          <Tile
            href="/features/marketplace"
            cta="Marketplace"
            title="Sell your skills"
            body="List digital products and services, with escrow on custom work."
          />
          <Tile
            href="/features/courses"
            cta="Courses"
            title="Teach what you know"
            body="Build a course, set your price and earn on every enrolment."
          />
        </div>
      </Band>

      <Band labelledBy="faq-title">
        <Faq id="faq-title" items={FAQ} />
      </Band>

      <Closing
        title="Your first task is a few minutes away."
        lead="Create a free account, pick something that fits, and see exactly what it pays before you start."
        primary={{ href: "/register", label: "Create a free account" }}
        secondary={{ href: "/referral", label: "How referrals work" }}
      />
    </>
  );
}
