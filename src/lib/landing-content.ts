// ────────────────────────────────────────────────────────────────────────────
// Section content types — safe to import from client components.
// The server-only fetcher (`getLandingContent`) lives in
// `src/lib/landing-content-server.ts` so prisma never leaks into the
// client bundle.
// ────────────────────────────────────────────────────────────────────────────

export interface NavLink {
  label: string;
  href: string;
}

export interface NavbarContent {
  nav_links: NavLink[];
  cta_signin_label: string;
  cta_signin_href: string;
  cta_signup_label: string;
  cta_signup_href: string;
}

export interface HeroStat {
  iconKey: string;
  value: string;
  label: string;
}

export interface HeroContent {
  badge: string;
  title_line1: string;
  title_line2: string;
  subtitle: string;
  cta_primary_label: string;
  cta_primary_href: string;
  cta_secondary_label: string;
  cta_secondary_href: string;
  stats: HeroStat[];
}

export interface FeatureItem {
  iconKey: string;
  title: string;
  description: string;
  gradient: string;
  /** Optional deep-link to a dedicated marketing page (e.g. /features/marketplace). */
  href?: string;
}

export interface FeaturesContent {
  badge: string;
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  items: FeatureItem[];
}

export interface HowItWorksStep {
  iconKey: string;
  step_number: string;
  title: string;
  description: string;
  gradient: string;
}

export interface HowItWorksContent {
  badge: string;
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  steps: HowItWorksStep[];
}

export interface CalculatorPlan {
  name: "FREE" | "STARTER" | "PRO" | "ELITE" | "VIP" | string;
  per_task: number;
  multiplier: number;
  /** How many team levels this plan unlocks (0–3). 0 = no team building. */
  team_levels: number;
}

export interface CalculatorContent {
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
  badge: string;
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  guarantee_text: string;
  plans: PackagePlan[];
}

export interface TestimonialItem {
  name: string;
  avatar: string;
  country: string;
  earned: string;
  rating: number;
  quote: string;
  gradient: string;
}

export interface TestimonialsContent {
  badge: string;
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  items: TestimonialItem[];
}

export interface TrustBadgeItem {
  iconKey: string;
  label: string;
}

export interface TrustBadgesContent {
  items: TrustBadgeItem[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqContent {
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
  heading_line1: string;
  heading_line2: string;
  subheading: string;
  cta_label: string;
  cta_href: string;
  disclaimer: string;
}

export interface FooterLinkGroup {
  title: string;
  links: NavLink[];
}

export interface FooterContent {
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
}

export interface LandingContent {
  navbar: NavbarContent;
  hero: HeroContent;
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
  { key: "features",     label: "Features",     description: "Earning method cards", icon: "Sparkles" },
  { key: "how_it_works", label: "How It Works", description: "4-step onboarding flow", icon: "ListOrdered" },
  { key: "calculator",   label: "Calculator",   description: "Plans, commissions, team economics", icon: "Calculator" },
  { key: "packages",     label: "Packages",     description: "Pricing tiers", icon: "Package" },
  { key: "testimonials", label: "Testimonials", description: "User success stories", icon: "MessageSquare" },
  { key: "trust_badges", label: "Trust Badges", description: "SSL / Safe / Countries / Top-rated", icon: "Shield" },
  { key: "faq",          label: "FAQ",          description: "Frequently asked questions", icon: "HelpCircle" },
  { key: "cta",          label: "Final CTA",    description: "Closing call-to-action card", icon: "Rocket" },
  { key: "footer",       label: "Footer",       description: "Brand, link groups, payment methods", icon: "PanelBottom" },
  { key: "appearance",   label: "Appearance",   description: "Default light/dark theme + animations", icon: "Palette" },
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
    nav_links: [
      { label: "Features", href: "#features" },
      { label: "Marketplace", href: "/features/marketplace" },
      { label: "Courses", href: "/features/courses" },
      { label: "Affiliate", href: "/features/affiliate" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
    cta_signin_label: "Sign In",
    cta_signin_href: "/login",
    cta_signup_label: "Get Started →",
    cta_signup_href: "/register",
  },
  hero: {
    badge: "Trusted by 100,000+ earners worldwide",
    title_line1: "Earn Smarter. Scale Faster.",
    title_line2: "All in One Platform.",
    subtitle:
      "Tasks, digital sales, courses, affiliate, team, and games — every way to earn, in one platform built to grow your passive income.",
    cta_primary_label: "Get Started Free",
    cta_primary_href: "/register",
    cta_secondary_label: "See how it works",
    cta_secondary_href: "#how-it-works",
    stats: [
      { iconKey: "Users", value: "100K+", label: "Active Users" },
      { iconKey: "DollarSign", value: "$2M+", label: "Paid Out" },
      { iconKey: "CheckCircle", value: "5M+", label: "Tasks Completed" },
      { iconKey: "Star", value: "4.9/5", label: "User Rating" },
    ],
  },
  features: {
    badge: "Multiple Ways to Earn",
    heading_line1: "One Account,",
    heading_line2: "Every Way to Earn",
    subheading:
      "Mix and match income streams — from quick micro-tasks to selling your own products. The more surfaces you use, the more you earn.",
    items: [
      {
        iconKey: "ClipboardList",
        title: "Micro Tasks",
        description:
          "Watch videos, take surveys, test apps, read articles, and complete social actions. Hundreds of quick tasks refreshed daily.",
        gradient: "from-blue-500 to-indigo-600",
      },
      {
        iconKey: "ShoppingBag",
        title: "Digital Marketplace",
        description:
          "Buy and sell digital products — templates, graphics, ebooks, music, and more. Turn your skills into a global storefront.",
        gradient: "from-emerald-500 to-teal-600",
        href: "/features/marketplace",
      },
      {
        iconKey: "GraduationCap",
        title: "Online Courses",
        description:
          "Learn new skills and earn certificates — or become a tutor and sell your own courses and live classes to students worldwide.",
        gradient: "from-amber-500 to-orange-600",
        href: "/features/courses",
      },
      {
        iconKey: "Handshake",
        title: "Affiliate Commissions",
        description:
          "Promote products and courses with your personal link and earn a commission on every sale you drive — paid to your wallet.",
        gradient: "from-fuchsia-500 to-pink-600",
        href: "/features/affiliate",
      },
      {
        iconKey: "Users",
        title: "Team & Referrals",
        description:
          "Invite friends, build a 3-level team, and earn passive commission on their activity — build it once, earn forever.",
        gradient: "from-purple-500 to-violet-600",
      },
      {
        iconKey: "MessageSquare",
        title: "Social Feed",
        description:
          "Post like on a social network and get paid for it. Earn from the likes, comments, and engagement your content receives.",
        gradient: "from-sky-500 to-blue-600",
      },
      {
        iconKey: "Gamepad2",
        title: "Games & Tournaments",
        description:
          "Play HTML5 games, enter quiz competitions and tournaments, and win from prize pools, lotteries, and daily draws.",
        gradient: "from-rose-500 to-red-600",
      },
      {
        iconKey: "Megaphone",
        title: "Advertiser Slots",
        description:
          "Run your own ads and campaigns across the platform, or create paid tasks to reach a global, engaged audience.",
        gradient: "from-cyan-500 to-sky-600",
      },
      {
        iconKey: "Wallet",
        title: "Instant Withdrawals",
        description:
          "Cash out to PayPal, bank, Wise, Payoneer, crypto, and more — fast, secure, and available across 180+ countries.",
        gradient: "from-indigo-500 to-blue-600",
      },
    ],
  },
  how_it_works: {
    badge: "Simple Process",
    heading_line1: "Start Earning in",
    heading_line2: "4 Easy Steps",
    subheading: "From sign-up to first payout in under 24 hours.",
    steps: [
      {
        iconKey: "UserPlus",
        step_number: "01",
        title: "Create Account",
        description:
          "Sign up in seconds with just your email — no credit card required.",
        gradient: "from-blue-500 to-blue-600",
      },
      {
        iconKey: "ListTodo",
        step_number: "02",
        title: "Complete Tasks",
        description:
          "Choose from hundreds of opportunities — videos, surveys, social, and more.",
        gradient: "from-indigo-500 to-purple-600",
      },
      {
        iconKey: "Coins",
        step_number: "03",
        title: "Earn Points",
        description:
          "Accumulate points with every task. Watch your balance grow in real-time.",
        gradient: "from-purple-500 to-pink-500",
      },
      {
        iconKey: "Wallet",
        step_number: "04",
        title: "Cash Out",
        description:
          "Withdraw to PayPal, bank transfer, Wise, Payoneer, crypto, or gift cards — fast and secure.",
        gradient: "from-pink-500 to-rose-500",
      },
    ],
  },
  calculator: {
    badge: "Earnings Calculator",
    heading: "See your earning potential",
    subheading:
      "Adjust your plan, daily tasks, and team size to estimate your monthly earnings.",
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
      "Upgrade to unlock more earning opportunities and exclusive benefits.",
    guarantee_text:
      "All paid plans come with a 7-day money-back guarantee. No questions asked.",
    plans: [
      {
        iconKey: "Zap",
        name: "Free",
        price: "$0",
        period: "forever",
        description: "Perfect for getting started",
        features: [
          "5 tasks per day",
          "Basic video rewards",
          "3-level referral bonus",
          "$10 minimum withdrawal",
          "5% withdrawal fee",
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
        description: "For regular earners",
        features: [
          "20 tasks per day",
          "Premium video rewards",
          "5-level referral bonus",
          "$5 minimum withdrawal",
          "3% withdrawal fee",
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
        description: "Most popular choice",
        features: [
          "50 tasks per day",
          "2x video rewards",
          "7-level referral bonus",
          "$3 minimum withdrawal",
          "2% withdrawal fee",
          "24/7 priority support",
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
        description: "For serious earners",
        features: [
          "Unlimited tasks",
          "3x video rewards",
          "10-level referral bonus",
          "$1 minimum withdrawal",
          "0% withdrawal fee",
          "Dedicated manager",
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
    badge: "Success Stories",
    heading_line1: "Loved by",
    heading_line2: "100,000+ Users",
    subheading: "Real stories from real earners across 180+ countries.",
    items: [
      {
        name: "Sarah M.",
        avatar: "SM",
        country: "🇺🇸 United States",
        earned: "$2,450",
        rating: 5,
        quote:
          "I was skeptical at first, but EarnGPT actually pays. Withdrew to PayPal three times already with zero issues.",
        gradient: "from-pink-500 to-rose-500",
      },
      {
        name: "James K.",
        avatar: "JK",
        country: "🇬🇧 United Kingdom",
        earned: "$1,890",
        rating: 5,
        quote:
          "The tasks pay really well. I do them during my commute and earn enough to cover my phone bill every month.",
        gradient: "from-blue-500 to-cyan-500",
      },
      {
        name: "Lukas B.",
        avatar: "LB",
        country: "🇩🇪 Germany",
        earned: "$2,780",
        rating: 5,
        quote:
          "Clean interface, fast payouts to my bank via Wise. This is the first site of its kind I actually trust.",
        gradient: "from-amber-500 to-orange-500",
      },
      {
        name: "Emily R.",
        avatar: "ER",
        country: "🇨🇦 Canada",
        earned: "$1,640",
        rating: 5,
        quote:
          "I earn on the side while watching TV. Cashed out to PayPal within a day, every single time.",
        gradient: "from-emerald-500 to-teal-500",
      },
      {
        name: "Daniel W.",
        avatar: "DW",
        country: "🇦🇺 Australia",
        earned: "$2,120",
        rating: 5,
        quote:
          "Surveys and offers add up faster than I expected. Support answered me at 2am — genuinely 24/7.",
        gradient: "from-sky-500 to-blue-500",
      },
      {
        name: "Sofia G.",
        avatar: "SG",
        country: "🇲🇽 Mexico",
        earned: "$1,375",
        rating: 5,
        quote:
          "Por fin una plataforma que paga de verdad. Retiré a mi cuenta sin problemas.",
        gradient: "from-rose-500 to-pink-500",
      },
      {
        name: "Omar A.",
        avatar: "OA",
        country: "🇦🇪 UAE",
        earned: "$3,050",
        rating: 5,
        quote:
          "Been using it for months. Payouts are on time and the referral income keeps growing every week.",
        gradient: "from-violet-500 to-purple-500",
      },
      {
        name: "Priya S.",
        avatar: "PS",
        country: "🇮🇳 India",
        earned: "$3,200",
        rating: 5,
        quote:
          "The referral program is amazing. My team earns passive income for me — it's life-changing.",
        gradient: "from-purple-500 to-violet-500",
      },
      {
        name: "Rahim H.",
        avatar: "RH",
        country: "🇧🇩 Bangladesh",
        earned: "$1,980",
        rating: 5,
        quote:
          "Started with a few tasks a day. Now the passive referral income covers most of my monthly expenses.",
        gradient: "from-green-500 to-emerald-500",
      },
      {
        name: "Yuki T.",
        avatar: "YT",
        country: "🇯🇵 Japan",
        earned: "$2,300",
        rating: 5,
        quote:
          "Simple, fast, and it actually pays out. The crypto withdrawal option is a huge plus for me.",
        gradient: "from-red-500 to-rose-500",
      },
    ],
  },
  trust_badges: {
    items: [
      { iconKey: "Shield", label: "SSL Secured" },
      { iconKey: "Lock", label: "GDPR & CCPA Ready" },
      { iconKey: "Globe", label: "180+ Countries" },
      { iconKey: "Trophy", label: "24/7 Support" },
    ],
  },
  faq: {
    badge: "FAQ",
    heading_line1: "Common",
    heading_line2: "Questions",
    subheading: "Everything you want to know — and a few you didn't.",
    contact_prompt: "Still have questions?",
    contact_label: "Contact our support team →",
    contact_email: "support@earngpt.com",
    items: [
      {
        question: "How much can I realistically earn?",
        answer:
          "Active users earn $50–$500/mo from tasks alone. With an active referral team, top earners pull in $1,000+/mo from passive commission across 3 levels (10% / 5% / 2%).",
      },
      {
        question: "When can I withdraw my earnings?",
        answer:
          "The minimum withdrawal is 5,000 points (≈ $5). Most withdrawals to PayPal, bank transfer, Wise, Payoneer, crypto, or gift cards are processed within 24–48 hours.",
      },
      {
        question: "Is EarnGPT available worldwide?",
        answer:
          "Yes — EarnGPT works in 180+ countries. Some tasks are region-specific, but every plan has plenty of global tasks plus referral commission that works everywhere.",
      },
      {
        question: "How does the referral program work?",
        answer:
          "When friends sign up with your code, you earn passive commission on their activity: 10% from Level 1 (direct), 5% from Level 2, and 2% from Level 3. Build a team once, earn forever.",
      },
      {
        question: "Is EarnGPT legit and safe to use?",
        answer:
          "Yes. Every account is protected with SSL encryption, we follow GDPR & CCPA data standards, and withdrawals are reviewed by a real team before payout. You never share your bank or card details to earn — you only add a payout method when you're ready to cash out.",
      },
      {
        question: "Do I need to pay anything to start?",
        answer:
          "No. Creating an account and earning from tasks, the social feed, referrals, and more is completely free — no credit card required. Paid plans are optional and simply unlock higher daily limits and lower withdrawal fees.",
      },
    ],
  },
  cta: {
    heading_line1: "Ready to Start",
    heading_line2: "Earning?",
    subheading:
      "Join 100,000+ users already earning money online. No experience needed. Start in minutes.",
    cta_label: "Create Free Account",
    cta_href: "/register",
    disclaimer: "No credit card required",
  },
  footer: {
    brand_description:
      "The #1 platform for earning money online. Complete tasks, watch videos, refer friends, and withdraw your earnings instantly.",
    payment_methods_label: "Supported Payments",
    payment_methods: ["PayPal", "Visa", "Mastercard", "Wise", "Payoneer", "Skrill", "Crypto"],
    link_groups: [
      {
        title: "Product",
        links: [
          { label: "Features", href: "#features" },
          { label: "Marketplace", href: "/features/marketplace" },
          { label: "Courses", href: "/features/courses" },
          { label: "Affiliate", href: "/features/affiliate" },
          { label: "Calculator", href: "#calculator" },
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
          { label: "Live Chat", href: "/contact" },
          { label: "Status", href: "/status" },
        ],
      },
    ],
    copyright_notice: "© {year} EarnGPT. All rights reserved.",
    tagline: "",
  },
  appearance: {
    theme: "dark",
    animations: true,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Server-side fetcher
// ────────────────────────────────────────────────────────────────────────────

export const LANDING_SETTING_KEY_PREFIX = "lp_";

export function settingKeyFor(section: SectionKey): string {
  return `${LANDING_SETTING_KEY_PREFIX}${section}`;
}
