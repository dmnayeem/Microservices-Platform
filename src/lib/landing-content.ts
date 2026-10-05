// ────────────────────────────────────────────────────────────────────────────
// Section content types — safe to import from client components.
// The server-only fetcher (`getLandingContent`) lives in
// `src/lib/landing-content-server.ts` so prisma never leaks into the
// client bundle.
// ────────────────────────────────────────────────────────────────────────────

export interface NavLink {
  /** Switched off in the editor: kept, but not shown on the site. */
  hidden?: boolean;
  label: string;
  href: string;
}

export interface NavbarContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  nav_links: NavLink[];
  cta_signin_label: string;
  cta_signin_href: string;
  cta_signup_label: string;
  cta_signup_href: string;
}

export interface HeroStat {
  /** Switched off in the editor: kept, but not shown on the site. */
  hidden?: boolean;
  iconKey: string;
  value: string;
  label: string;
}

export interface HeroContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  badge: string;
  title_line1: string;
  title_line2: string;
  subtitle: string;
  cta_primary_label: string;
  cta_primary_href: string;
  cta_secondary_label: string;
  cta_secondary_href: string;
  stats: HeroStat[];
  /**
   * The moving element on the hero's balance-card mock. Optional: content
   * saved before this existed has none and renders the default ("task"),
   * which is the original "Task approved +$0.42" chip, unchanged.
   */
  animation?: HeroAnimation;
}

// ── Hero balance-card animation ────────────────────────────────────────────

export const HERO_ANIMATION_STYLES = ["task", "ticker", "feed", "withdrawal", "coins"] as const;
export type HeroAnimationStyle = (typeof HERO_ANIMATION_STYLES)[number];

export const HERO_ANIMATION_LABELS: Record<HeroAnimationStyle, string> = {
  task: "Task completed",
  ticker: "Live earnings ticker",
  feed: "Activity feed",
  withdrawal: "Withdrawal success",
  coins: "Rewards rain / coins",
};

export interface HeroFeedItem {
  text: string;
  amount: number;
  /** "in" = money earned (+), "out" = a payout sent (✓). */
  kind: "in" | "out";
}

export interface HeroAnimation {
  style: HeroAnimationStyle;
  /** Cycle through `rotateStyles` every `intervalSec` seconds. */
  rotate: boolean;
  rotateStyles: HeroAnimationStyle[];
  intervalSec: number;
  /** Symbol shown before every amount on the mock ("$", "৳", "€" …). */
  currency: string;
  task: { label: string; amount: number };
  ticker: { label: string; start: number; step: number };
  feed: { items: HeroFeedItem[] };
  withdrawal: { method: string; amount: number; pendingLabel: string; doneLabel: string };
  coins: { label: string; points: number; level: string };
}

/** Limits the editor shows and the save route / renderer enforce. */
export const HERO_ANIM_LIMITS = {
  text: 40,
  short: 16,
  currency: 4,
  amountMax: 100_000,
  pointsMax: 100_000,
  intervalMin: 4,
  intervalMax: 30,
  feedMax: 5,
} as const;

export const DEFAULT_HERO_ANIMATION: HeroAnimation = {
  style: "task",
  rotate: false,
  rotateStyles: ["task", "ticker", "feed"],
  intervalSec: 8,
  currency: "$",
  task: { label: "Task approved", amount: 0.42 },
  ticker: { label: "Earning live", start: 248.6, step: 0.25 },
  feed: {
    items: [
      { text: "Survey completed", amount: 1.2, kind: "in" },
      { text: "Referral bonus", amount: 0.5, kind: "in" },
      { text: "Withdrawal sent", amount: 15, kind: "out" },
    ],
  },
  withdrawal: { method: "PayPal", amount: 25, pendingLabel: "Sending payout", doneLabel: "Paid" },
  coins: { label: "Level 7", points: 50, level: "XP" },
};

const isStyle = (s: unknown): s is HeroAnimationStyle =>
  typeof s === "string" && (HERO_ANIMATION_STYLES as readonly string[]).includes(s);

/** Plain text, trimmed, control chars removed, capped. Empty → fallback. */
function cleanText(v: unknown, max: number, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return s || fallback;
}

/** Finite number clamped to [min, max], rounded to 2 decimals. Bad → fallback. */
function cleanNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

/**
 * Any stored / submitted value → a complete, valid `HeroAnimation`.
 * Missing or malformed fields fall back to the defaults, so old content (no
 * `animation` at all) renders the original chip.
 */
export function normalizeHeroAnimation(raw: unknown): HeroAnimation {
  const d = DEFAULT_HERO_ANIMATION;
  const L = HERO_ANIM_LIMITS;
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const obj = (v: unknown) =>
    (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const task = obj(r.task);
  const ticker = obj(r.ticker);
  const feed = obj(r.feed);
  const wd = obj(r.withdrawal);
  const coins = obj(r.coins);

  const rotateStyles = Array.isArray(r.rotateStyles)
    ? [...new Set(r.rotateStyles.filter(isStyle))]
    : d.rotateStyles;

  const feedItems = Array.isArray(feed.items)
    ? feed.items
        .slice(0, L.feedMax)
        .map((it) => obj(it))
        .map((it) => ({
          text: cleanText(it.text, L.text, ""),
          amount: cleanNum(it.amount, 0, L.amountMax, 0),
          kind: it.kind === "out" ? ("out" as const) : ("in" as const),
        }))
        .filter((it) => it.text)
    : d.feed.items;

  return {
    style: isStyle(r.style) ? r.style : d.style,
    rotate: r.rotate === true,
    rotateStyles: rotateStyles.length ? rotateStyles : d.rotateStyles,
    intervalSec: Math.round(cleanNum(r.intervalSec, L.intervalMin, L.intervalMax, d.intervalSec)),
    currency: cleanText(r.currency, L.currency, d.currency),
    task: {
      label: cleanText(task.label, L.text, d.task.label),
      amount: cleanNum(task.amount, 0, L.amountMax, d.task.amount),
    },
    ticker: {
      label: cleanText(ticker.label, L.text, d.ticker.label),
      start: cleanNum(ticker.start, 0, L.amountMax, d.ticker.start),
      step: cleanNum(ticker.step, 0.01, 1000, d.ticker.step),
    },
    feed: { items: feedItems.length ? feedItems : d.feed.items },
    withdrawal: {
      method: cleanText(wd.method, L.short, d.withdrawal.method),
      amount: cleanNum(wd.amount, 0, L.amountMax, d.withdrawal.amount),
      pendingLabel: cleanText(wd.pendingLabel, L.text, d.withdrawal.pendingLabel),
      doneLabel: cleanText(wd.doneLabel, L.short, d.withdrawal.doneLabel),
    },
    coins: {
      label: cleanText(coins.label, L.short, d.coins.label),
      points: Math.round(cleanNum(coins.points, 1, L.pointsMax, d.coins.points)),
      level: cleanText(coins.level, L.short, d.coins.level),
    },
  };
}

/** "$" + 1,234.50 — fixed locale so server and browser render the same text. */
export function heroMoney(currency: string, n: number): string {
  return (
    currency +
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export interface FeatureItem {
  /** Switched off in the editor: kept, but not shown on the site. */
  hidden?: boolean;
  iconKey: string;
  title: string;
  description: string;
  gradient: string;
  /** Optional deep-link to a dedicated marketing page (e.g. /features/marketplace). */
  href?: string;
}

export interface FeaturesContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  badge: string;
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  items: FeatureItem[];
}

/**
 * "Who it's for" (owner, 2026-10-05: visitors could not tell what the platform
 * IS, what they would do here, or what they would get). One card per kind of
 * visitor — someone who wants to earn, someone who makes things, a business —
 * each with what they do and what they get, right under the hero.
 */
export interface AudienceItem {
  /** Switched off in the editor: kept, but not shown on the site. */
  hidden?: boolean;
  iconKey: string;
  title: string;
  /** One line: who this card is for. */
  who: string;
  /** Short steps — what you actually do. */
  does: string[];
  /** One line: what you get. */
  gets: string;
  cta_label: string;
  cta_href: string;
}

export interface AudiencesContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  badge: string;
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  items: AudienceItem[];
}

export interface HowItWorksStep {
  /** Switched off in the editor: kept, but not shown on the site. */
  hidden?: boolean;
  iconKey: string;
  step_number: string;
  title: string;
  description: string;
  gradient: string;
}

export interface HowItWorksContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  badge: string;
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  steps: HowItWorksStep[];
}

export interface CalculatorPlan {
  /** Switched off in the editor: kept, but not shown on the site. */
  hidden?: boolean;
  name: "FREE" | "STARTER" | "PRO" | "ELITE" | "VIP" | string;
  per_task: number;
  multiplier: number;
  /** How many team levels this plan unlocks (0–3). 0 = no team building. */
  team_levels: number;
}

export interface CalculatorContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  badge: string;
  heading: string;
  subheading: string;
  points_per_dollar: number;
  commission_l1: number;
  commission_l2: number;
  commission_l3: number;
  avg_team_tasks_per_day: number;
  avg_team_rate: number;
  plans: CalculatorPlan[];
}

export interface PackagePlan {
  /** Switched off in the editor: kept, but not shown on the site. */
  hidden?: boolean;
  iconKey: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta_label: string;
  is_popular: boolean;
  gradient: string;
}

export interface PackagesContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  badge: string;
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  guarantee_text: string;
  plans: PackagePlan[];
}

export interface TestimonialItem {
  /** Switched off in the editor: kept, but not shown on the site. */
  hidden?: boolean;
  name: string;
  avatar: string;
  country: string;
  earned: string;
  rating: number;
  quote: string;
  gradient: string;
}

export interface TestimonialsContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  badge: string;
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  items: TestimonialItem[];
}

export interface TrustBadgeItem {
  /** Switched off in the editor: kept, but not shown on the site. */
  hidden?: boolean;
  iconKey: string;
  label: string;
}

export interface TrustBadgesContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  items: TrustBadgeItem[];
}

export interface FaqItem {
  /** Switched off in the editor: kept, but not shown on the site. */
  hidden?: boolean;
  question: string;
  answer: string;
}

export interface FaqContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  badge: string;
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  contact_prompt: string;
  contact_label: string;
  contact_email: string;
  items: FaqItem[];
}

export interface CtaContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  cta_label: string;
  cta_href: string;
  disclaimer: string;
}

export interface FooterLinkGroup {
  /** Switched off in the editor: kept, but not shown on the site. */
  hidden?: boolean;
  title: string;
  links: NavLink[];
}

export interface FooterContent {
  /** False = the whole section is switched off (kept, not shown). Missing = on. */
  enabled?: boolean;
  brand_description: string;
  payment_methods: string[];
  payment_methods_label: string;
  link_groups: FooterLinkGroup[];
  copyright_notice: string;
  tagline: string;
}

export interface AppearanceContent {
  /** Default theme shown to first-time visitors (they can toggle their own). */
  theme: "light" | "dark";
  /** Master switch for landing background blobs + hover-zoom animations. */
  animations: boolean;
  /**
   * Show the visitor light/dark switch in the navbar. Off: the switch is
   * hidden and every visitor sees `theme`, even one who had picked the other.
   * Missing (content saved before this existed) = on.
   */
  themeToggle?: boolean;
}

export interface LandingContent {
  navbar: NavbarContent;
  hero: HeroContent;
  audiences: AudiencesContent;
  features: FeaturesContent;
  how_it_works: HowItWorksContent;
  calculator: CalculatorContent;
  packages: PackagesContent;
  testimonials: TestimonialsContent;
  trust_badges: TrustBadgesContent;
  faq: FaqContent;
  cta: CtaContent;
  footer: FooterContent;
  appearance: AppearanceContent;
}

export type SectionKey = keyof LandingContent;

// ────────────────────────────────────────────────────────────────────────────
// Section catalog (order = sidebar order in editor)
// ────────────────────────────────────────────────────────────────────────────

export const LANDING_SECTIONS: ReadonlyArray<{
  key: SectionKey;
  label: string;
  description: string;
  icon: string;
}> = [
  { key: "navbar",       label: "Navbar",       description: "Top nav links + sign-in / sign-up CTAs", icon: "Menu" },
  { key: "hero",         label: "Hero",         description: "Trust badge, headline, CTAs, stat cards", icon: "Star" },
  { key: "audiences",    label: "Who it's for", description: "What each kind of visitor does here and gets", icon: "Users" },
  { key: "features",     label: "Features",     description: "Earning method cards", icon: "Sparkles" },
  { key: "how_it_works", label: "How It Works", description: "4-step onboarding flow", icon: "ListOrdered" },
  { key: "calculator",   label: "Calculator",   description: "Plans, commissions, team economics", icon: "Calculator" },
  { key: "packages",     label: "Packages",     description: "Pricing tiers", icon: "Package" },
  { key: "testimonials", label: "Testimonials", description: "User success stories", icon: "MessageSquare" },
  { key: "trust_badges", label: "Trust Badges", description: "SSL / Safe / Countries / Top-rated", icon: "Shield" },
  { key: "faq",          label: "FAQ",          description: "Frequently asked questions", icon: "HelpCircle" },
  { key: "cta",          label: "Final CTA",    description: "Closing call-to-action card", icon: "Rocket" },
  { key: "footer",       label: "Footer",       description: "Brand, link groups, payment methods", icon: "PanelBottom" },
  { key: "appearance",   label: "Appearance",   description: "Default light/dark theme, visitor switch + animations", icon: "Palette" },
] as const;

export const SECTION_KEYS = LANDING_SECTIONS.map((s) => s.key) as readonly SectionKey[];

export function isSectionKey(s: string): s is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(s);
}

// ────────────────────────────────────────────────────────────────────────────
// Defaults — mirrors the current hardcoded copy in src/components/landing/*
// ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  navbar: {
    // Features, Pricing and FAQ were removed from the bar at the owner's
    // request. Their SECTIONS are untouched and still on the page — only the
    // menu entries are gone, so the anchors still work if something links to
    // them. What is left is six destinations, all of them real pages.
    nav_links: [
      { label: "MicroTask", href: "/microtask" },
      { label: "Advertise", href: "/advertise" },
      { label: "Marketplace", href: "/features/marketplace" },
      { label: "Courses", href: "/features/courses" },
      { label: "Affiliate", href: "/features/affiliate" },
    ],
    cta_signin_label: "Sign In",
    cta_signin_href: "/login",
    cta_signup_label: "Get Started →",
    cta_signup_href: "/register",
  },
  hero: {
    badge: "Micro-tasks · Marketplace · Courses",
    title_line1: "Get Paid for Real Work.",
    title_line2: "Sell, Learn and Teach.",
    subtitle:
      "Do small paid tasks for real businesses, sell digital products and services, and take or teach courses — all from one free account.",
    cta_primary_label: "Create a Free Account",
    cta_primary_href: "/register",
    cta_secondary_label: "See how it works",
    cta_secondary_href: "#how-it-works",
    // No member counts, payout totals or ratings here: a number on the home
    // page has to be one the platform can stand behind on the day it is read.
    stats: [
      { iconKey: "Users", value: "$0", label: "To create an account" },
      { iconKey: "CheckCircle", value: "Tasks", label: "Pay shown before you start" },
      { iconKey: "Sparkles", value: "Shop", label: "Digital products & services" },
      { iconKey: "Trophy", value: "Learn", label: "Courses — take or teach" },
    ],
    animation: DEFAULT_HERO_ANIMATION,
  },
  features: {
    badge: "What you can do on RevType",
    heading_line1: "One Account,",
    heading_line2: "Several Ways to Work",
    subheading:
      "Micro-tasks, a digital marketplace, courses and creator commissions. Use one or combine them — you earn from the work you complete.",
    items: [
      {
        iconKey: "ClipboardList",
        title: "Micro Tasks",
        description:
          "Short jobs from businesses: social actions, app tests, surveys and video reviews. Pay and proof are shown before you start.",
        gradient: "from-blue-500 to-indigo-600",
        href: "/microtask",
      },
      {
        iconKey: "ShoppingBag",
        title: "Digital Marketplace",
        description:
          "Sell templates, graphics, ebooks, code and services. Every listing is reviewed, and service deals use escrow.",
        gradient: "from-emerald-500 to-teal-600",
        href: "/features/marketplace",
      },
      {
        iconKey: "GraduationCap",
        title: "Online Courses",
        description:
          "Learn practical skills and earn a certificate — or apply as a tutor and sell your own courses.",
        gradient: "from-amber-500 to-orange-600",
        href: "/features/courses",
      },
      {
        iconKey: "Handshake",
        title: "Affiliate Commissions",
        description:
          "Share products and courses with your personal link and earn the seller's commission on each referred sale.",
        gradient: "from-fuchsia-500 to-pink-600",
        href: "/features/affiliate",
      },
      {
        iconKey: "Users",
        title: "Team & Referrals",
        description:
          "Invite people you know. Rewards follow their genuine activity, with caps and anti-abuse checks.",
        gradient: "from-purple-500 to-violet-600",
        href: "/referral",
      },
      {
        iconKey: "MessageSquare",
        title: "Social Feed",
        description:
          "A community feed for posts, tips and work. Rewards follow genuine engagement, not raw volume.",
        gradient: "from-sky-500 to-blue-600",
        href: "/microtask#feed",
      },
      {
        iconKey: "Gamepad2",
        title: "Games & Tournaments",
        description:
          "Optional extras: quizzes, HTML5 games, leaderboards and prize draws, each with published rules.",
        gradient: "from-rose-500 to-red-600",
        href: "/microtask#more-ways",
      },
      {
        iconKey: "Megaphone",
        title: "Advertiser Slots",
        description:
          "For businesses: run reviewed ad campaigns, or post paid tasks for verified people to complete.",
        gradient: "from-cyan-500 to-sky-600",
        href: "/advertise",
      },
      {
        iconKey: "Wallet",
        title: "Withdrawals",
        description:
          "Cash out to PayPal, crypto or mobile wallets where enabled. Minimum, fee and requirements are shown first.",
        gradient: "from-indigo-500 to-blue-600",
        href: "/microtask#payout",
      },
    ],
  },
  audiences: {
    badge: "What you can do here",
    heading_line1: "One platform,",
    heading_line2: "three ways to use it",
    subheading: "Earn from small online jobs, sell what you make, or grow your business. Pick the one that fits you.",
    items: [
      {
        iconKey: "Coins",
        title: "Earn from small tasks",
        who: "For anyone with a phone and a few spare minutes.",
        does: [
          "Pick a task: follow a page, test an app, answer a survey",
          "Send the proof it asks for",
          "Approved work is paid to your wallet",
        ],
        gets: "Every task shows its reward before you start.",
        cta_label: "See the tasks",
        cta_href: "/microtask",
      },
      {
        iconKey: "ShoppingBag",
        title: "Sell your skills & products",
        who: "For creators, freelancers and teachers.",
        does: [
          "List templates, designs, ebooks or a service",
          "Publish a course or teach live classes",
          "Share affiliate links to other sellers' products",
        ],
        gets: "You set the price; buyers pay through escrow and the platform keeps a commission.",
        cta_label: "Explore the marketplace",
        cta_href: "/features/marketplace",
      },
      {
        iconKey: "Megaphone",
        title: "Grow your business",
        who: "For brands, shops and anyone who needs people to act.",
        does: [
          "Post a paid task and get real people to do it",
          "Run ads across the feed and the app",
          "Choose who sees them by country, age and more",
        ],
        gets: "Real actions from real members, and ad space where they spend their time.",
        cta_label: "Advertise with us",
        cta_href: "/advertise",
      },
    ],
  },
  how_it_works: {
    badge: "How it works",
    heading_line1: "From Sign-Up",
    heading_line2: "to Payout",
    subheading:
      "Four steps — the same for tasks, products and courses.",
    steps: [
      {
        iconKey: "UserPlus",
        step_number: "01",
        title: "Create an account",
        description:
          "Sign up free with email or Google. No credit card needed.",
        gradient: "from-blue-500 to-blue-600",
      },
      {
        iconKey: "ListTodo",
        step_number: "02",
        title: "Choose your work",
        description:
          "Pick an eligible task, list a product or service, or join a course.",
        gradient: "from-indigo-500 to-purple-600",
      },
      {
        iconKey: "Coins",
        step_number: "03",
        title: "Get verified",
        description:
          "Proof is checked before you are paid. Rejected work is not paid, and you see why.",
        gradient: "from-purple-500 to-pink-500",
      },
      {
        iconKey: "Wallet",
        step_number: "04",
        title: "Withdraw",
        description:
          "Convert points to cash and request a payout. Minimum, fee and requirements are shown first.",
        gradient: "from-pink-500 to-rose-500",
      },
    ],
  },
  calculator: {
    badge: "Illustrative calculator",
    heading: "How task rates and plans add up",
    subheading:
      "An illustration, not a forecast. Real pay is set per task and depends on availability, approval and your time.",
    points_per_dollar: 1000,
    commission_l1: 10,
    commission_l2: 5,
    commission_l3: 2,
    avg_team_tasks_per_day: 20,
    avg_team_rate: 0.02,
    plans: [
      { name: "FREE", per_task: 0.02, multiplier: 1, team_levels: 0 },
      { name: "STARTER", per_task: 0.04, multiplier: 1.1, team_levels: 1 },
      { name: "PRO", per_task: 0.06, multiplier: 1.25, team_levels: 2 },
      { name: "ELITE", per_task: 0.08, multiplier: 1.4, team_levels: 3 },
      { name: "VIP", per_task: 0.1, multiplier: 1.5, team_levels: 3 },
    ],
  },
  packages: {
    badge: "Pricing",
    heading_line1: "Choose Your",
    heading_line2: "Perfect Plan",
    subheading:
      "Joining and earning are free. Optional paid plans raise daily task limits and unlock extra features.",
    guarantee_text:
      "Withdrawals may need an active paid plan — the withdrawal screen tells you first. Plan purchases follow our Refund Policy.",
    plans: [
      {
        iconKey: "Zap",
        name: "Free",
        price: "$0",
        period: "forever",
        description: "Join, explore and complete tasks",
        features: [
          "5 tasks per day",
          "Basic video rewards",
          "3-level referral bonus",
          "Email support",
        ],
        cta_label: "Start Free",
        is_popular: false,
        gradient: "from-gray-600 to-gray-700",
      },
      {
        iconKey: "Star",
        name: "Basic",
        price: "$4.99",
        period: "/month",
        description: "For regular task takers",
        features: [
          "20 tasks per day",
          "Premium video rewards",
          "5-level referral bonus",
          "Priority support",
          "Exclusive tasks",
        ],
        cta_label: "Get Basic",
        is_popular: false,
        gradient: "from-indigo-500 to-indigo-600",
      },
      {
        iconKey: "Sparkles",
        name: "Standard",
        price: "$9.99",
        period: "/month",
        description: "Higher daily limits",
        features: [
          "50 tasks per day",
          "2x video rewards",
          "7-level referral bonus",
          "Priority support",
          "VIP tasks access",
          "Weekly bonus rewards",
        ],
        cta_label: "Get Standard",
        is_popular: true,
        gradient: "from-purple-500 to-pink-500",
      },
      {
        iconKey: "Crown",
        name: "Premium",
        price: "$19.99",
        period: "/month",
        description: "For full-time freelancers",
        features: [
          "Unlimited tasks",
          "3x video rewards",
          "10-level referral bonus",
          "Exclusive VIP tasks",
          "Daily bonus rewards",
          "Early feature access",
        ],
        cta_label: "Go Premium",
        is_popular: false,
        gradient: "from-amber-500 to-orange-500",
      },
    ],
  },
  testimonials: {
    // Off, and empty, by default. The stories that used to ship here were
    // invented: names, countries and "earned" amounts nobody had verified.
    // Switch the section on from the landing editor only with real members'
    // stories, published with their permission.
    enabled: false,
    badge: "Member stories",
    heading_line1: "From the",
    heading_line2: "RevType Community",
    subheading: "Experiences shared by members, published with their permission.",
    items: [],
  },
  trust_badges: {
    items: [
      { iconKey: "Shield", label: "Encrypted HTTPS" },
      { iconKey: "BadgeCheck", label: "Work reviewed" },
      { iconKey: "Lock", label: "ID-checked payouts" },
      { iconKey: "Headphones", label: "Email support" },
    ],
  },
  faq: {
    badge: "FAQ",
    heading_line1: "Common",
    heading_line2: "Questions",
    subheading: "How RevType works, how it is funded, and how you get paid.",
    contact_prompt: "Still have questions?",
    contact_label: "Contact our support team →",
    contact_email: "support@revtype.com",
    items: [
      {
        question: "What is RevType?",
        answer:
          "RevType is a freelance micro-task marketplace and digital skill-sharing community. Members complete short paid tasks posted by businesses and advertisers, sell digital products and freelance services in the marketplace, take or teach online courses, and earn affiliate commissions on sales they refer.",
      },
      {
        question: "Is RevType a PTC (paid-to-click) site?",
        answer:
          "No. Pay on RevType comes from completed work, marketplace sales and teaching: tasks have defined instructions and are verified before they are paid. Like many free platforms, RevType does display ads, and some tasks and activities are sponsored by advertisers. Earnings are never guaranteed.",
      },
      {
        question: "How does RevType make money?",
        answer:
          "From advertising, from businesses that fund tasks and campaigns, from a platform fee on marketplace sales, from optional paid membership plans, and from a withdrawal fee. That revenue is what funds the payments made to members.",
      },
      {
        question: "How much can I earn?",
        answer:
          "There is no fixed or guaranteed amount. Each task shows its pay before you start, and income depends on which tasks are available in your region, whether your work is approved, and what you sell or teach. Treat it as flexible side income, not a salary.",
      },
      {
        question: "Do I have to pay to join or withdraw?",
        answer:
          "Creating an account and completing tasks is free. Withdrawals can require an active paid plan; this is a platform setting, and when it is on the withdrawal screen tells you before you request a payout. A withdrawal fee and a minimum amount also apply and are shown before you confirm.",
      },
      {
        question: "How are payouts made and how long do they take?",
        answer:
          "You convert points to cash in your wallet, then request a payout to an enabled method such as PayPal, Binance, Bitget, bKash, Nagad or Rocket. Each request is reviewed by the team; the current processing time is shown on the withdrawal screen and can be several business days.",
      },
    ],
  },
  cta: {
    heading_line1: "Put Your Skills",
    heading_line2: "to Work",
    subheading:
      "Create a free account to browse tasks, open a storefront or join a course. You earn from the work you complete.",
    cta_label: "Create Free Account",
    cta_href: "/register",
    disclaimer: "Free to join · No credit card required",
  },
  footer: {
    brand_description:
      "Paid micro-tasks from real businesses, a marketplace for digital products and services, online courses and creator commissions.",
    payment_methods_label: "Payout methods (where enabled)",
    payment_methods: ["PayPal", "Binance", "Bitget", "bKash", "Nagad", "Rocket"],
    link_groups: [
      {
        title: "Product",
        links: [
          { label: "Features", href: "#features" },
          { label: "Micro-tasks", href: "/microtask" },
          { label: "Marketplace", href: "/features/marketplace" },
          { label: "Courses", href: "/features/courses" },
          { label: "Affiliate", href: "/features/affiliate" },
          { label: "Referral", href: "/referral" },
          { label: "Advertise", href: "/advertise" },
          { label: "Pricing", href: "#pricing" },
        ],
      },
      {
        title: "Company",
        links: [
          { label: "About Us", href: "/about" },
          { label: "Careers", href: "/careers" },
          { label: "Blog", href: "/blog" },
          { label: "Press Kit", href: "/press" },
        ],
      },
      {
        title: "Legal",
        links: [
          { label: "Terms of Service", href: "/terms" },
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Cookie Policy", href: "/cookies" },
          { label: "Refund Policy", href: "/refund" },
        ],
      },
      {
        title: "Support",
        links: [
          { label: "Help Center", href: "/help" },
          { label: "Contact Us", href: "/contact" },
          { label: "FAQ", href: "/help" },
          { label: "Status", href: "/status" },
        ],
      },
    ],
    copyright_notice: "© {year} RevType. All rights reserved.",
    tagline: "A freelance micro-task marketplace and digital skill-sharing community.",
  },
  appearance: {
    theme: "dark",
    animations: true,
    themeToggle: true,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Server-side fetcher
// ────────────────────────────────────────────────────────────────────────────

export const LANDING_SETTING_KEY_PREFIX = "lp_";

export function settingKeyFor(section: SectionKey): string {
  return `${LANDING_SETTING_KEY_PREFIX}${section}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Reconciliation with the marketing routes that actually exist
// ────────────────────────────────────────────────────────────────────────────

/**
 * The problem these two functions solve.
 *
 * `getLandingContent()` merges stored SystemSetting rows over the defaults
 * SHALLOWLY, by section. So the moment anybody saves the navbar section in the
 * landing editor, the stored `nav_links` array replaces this file's array
 * wholesale — and a link added to the defaults in a later release never
 * appears, on a site whose menu looks perfectly fine in the code. The same is
 * true of `features.items`, which is why several earn cards could point
 * nowhere while this file said they had an `href`.
 *
 * These reconcile the stored content with the marketing pages that exist:
 * anything missing is added back, anything the admin has customised is left
 * exactly as they set it.
 */

/** Marketing pages that must be reachable from the public menu. */
export const REQUIRED_NAV_LINKS: readonly NavLink[] = [
  { label: "MicroTask", href: "/microtask" },
  { label: "Advertise", href: "/advertise" },
] as const;

/**
 * Where each earn card goes, keyed by its title.
 *
 * Referral is deliberately here and deliberately NOT in `REQUIRED_NAV_LINKS`:
 * the page is reached from its card and from the other marketing pages, not
 * from the menu.
 */
export const EARN_CARD_LINKS: Readonly<Record<string, string>> = {
  "Micro Tasks": "/microtask",
  "Digital Marketplace": "/features/marketplace",
  "Online Courses": "/features/courses",
  "Affiliate Commissions": "/features/affiliate",
  "Team & Referrals": "/referral",
  "Social Feed": "/microtask#feed",
  "Games & Tournaments": "/microtask#more-ways",
  "Advertiser Slots": "/advertise",
  "Withdrawals": "/microtask#payout",
  // The card's title before 2026-10; kept so a saved card with the old name still links.
  "Instant Withdrawals": "/microtask#payout",
};

/** Adds back any required marketing link a stored navbar dropped. */
export function withRequiredNavLinks(navbar: NavbarContent): NavbarContent {
  const have = new Set(navbar.nav_links.map((l) => l.href));
  const missing = REQUIRED_NAV_LINKS.filter((l) => !have.has(l.href));
  if (missing.length === 0) return navbar;
  // Before "Pricing" if a stored navbar still has one — the owner removed it
  // from the default bar, but a customised navbar saved earlier may keep it, and
  // the grouping should still hold there. Otherwise append.
  const at = navbar.nav_links.findIndex((l) => l.href === "#pricing");
  const links = [...navbar.nav_links];
  links.splice(at === -1 ? links.length : at, 0, ...missing);
  return { ...navbar, nav_links: links };
}

/** Gives every known earn card its destination, without overriding a custom one. */
export function withEarnCardLinks(features: FeaturesContent): FeaturesContent {
  return {
    ...features,
    items: features.items.map((it) =>
      it.href?.trim() ? it : { ...it, href: EARN_CARD_LINKS[it.title] }
    ),
  };
}


// ── Show / hide without deleting ───────────────────────────────────────────
// Every section can be switched off and every list item hidden from the
// editor; nothing is deleted. The public pages read the content through
// `publicLanding`, so no section component needs to know about either flag.

/** Sections with an on/off switch — every visible one (Appearance is settings). */
export const TOGGLEABLE_SECTIONS: SectionKey[] = [
  "navbar", "hero", "audiences", "features", "how_it_works", "calculator", "packages",
  "testimonials", "trust_badges", "faq", "cta", "footer",
];

/** Is this section switched on? A section that has never been toggled is on. */
export function sectionOn(content: LandingContent, key: SectionKey): boolean {
  return (content[key] as { enabled?: boolean } | undefined)?.enabled !== false;
}

const visible = <T,>(xs: T[] | undefined): T[] =>
  (xs ?? []).filter((x) => !(x as { hidden?: boolean }).hidden);

/** The content as the public sees it: every hidden item removed. */
export function publicLanding(c: LandingContent): LandingContent {
  return {
    ...c,
    navbar: { ...c.navbar, nav_links: visible(c.navbar.nav_links) },
    hero: { ...c.hero, stats: visible(c.hero.stats) },
    audiences: { ...c.audiences, items: visible(c.audiences.items) },
    features: { ...c.features, items: visible(c.features.items) },
    how_it_works: { ...c.how_it_works, steps: visible(c.how_it_works.steps) },
    calculator: { ...c.calculator, plans: visible(c.calculator.plans) },
    packages: { ...c.packages, plans: visible(c.packages.plans) },
    testimonials: { ...c.testimonials, items: visible(c.testimonials.items) },
    trust_badges: { ...c.trust_badges, items: visible(c.trust_badges.items) },
    faq: { ...c.faq, items: visible(c.faq.items) },
    footer: {
      ...c.footer,
      link_groups: visible(c.footer.link_groups).map((g) => ({ ...g, links: visible(g.links) })),
    },
  };
}
