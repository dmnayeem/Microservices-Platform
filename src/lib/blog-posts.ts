// Static blog content (no CMS). Each post renders on /blog/[slug]; the index
// lists them. Keep posts evergreen and genuinely useful.

export interface BlogBlock {
  heading?: string;
  paragraphs: string[];
  bullets?: string[];
}
export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date: string; // ISO
  readMinutes: number;
  author: string;
  emoji: string;
  body: BlogBlock[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-to-earn-money-online-safely",
    title: "How to earn money online safely in 2026",
    excerpt: "A practical, no-hype guide to real online income — how to spot scams, protect yourself, and get paid reliably.",
    category: "Guides",
    date: "2026-07-20",
    readMinutes: 7,
    author: "The EarnGPT Team",
    emoji: "🛡️",
    body: [
      { paragraphs: ["The internet is full of “earn money online” promises, and most of them don't pay. The good news: legitimate online earning is very real — you just need to know how to separate the trustworthy from the traps. Here's how."] },
      { heading: "1. Never pay to earn", paragraphs: ["A genuine earning platform pays you — not the other way around. If a site asks for an upfront “activation fee” or wants your card to “verify” before you've earned anything, walk away. Real platforms make money from advertisers and partners, not from you."] },
      { heading: "2. Check how (and how fast) you get paid", paragraphs: ["Before investing time, confirm the payout methods and minimums. Trustworthy platforms are upfront about payment rails (PayPal, bank transfer, Wise, Payoneer, crypto, gift cards), minimum thresholds, and processing times."] },
      { heading: "3. Protect your account", paragraphs: ["Use a unique, strong password and turn on two-factor authentication. Be wary of anyone asking for your password, one-time codes, or remote access — no legitimate support team ever needs them."], bullets: ["Unique password per site", "Two-factor authentication on", "Never share OTP codes", "Withdraw to accounts you control"] },
      { heading: "4. Read reviews — and the fine print", paragraphs: ["Look for consistent, recent payout proof from real users across countries. Skim the Terms and Refund policy so there are no surprises at withdrawal time."] },
      { heading: "The bottom line", paragraphs: ["Real online earning is steady, transparent, and boring in the best way. Start small, confirm your first payout, and scale from there."] },
    ],
  },
  {
    slug: "getting-the-most-from-referrals",
    title: "Getting the most from your referral network",
    excerpt: "Referrals can quietly become your biggest income stream. Here's how to build one the right way.",
    category: "Growth",
    date: "2026-07-06",
    readMinutes: 6,
    author: "The EarnGPT Team",
    emoji: "🤝",
    body: [
      { paragraphs: ["Task earnings are active income — you work, you earn. Referrals are different: build a network once, and you earn a share of their activity for the long run. Done right, it's the most durable income on the platform."] },
      { heading: "How referral earning works", paragraphs: ["When someone joins with your link, they become part of your network. You earn a commission on their qualifying activity across multiple levels — without taking anything away from what they earn. It's a bonus on top, funded by the platform."] },
      { heading: "Share where trust already exists", paragraphs: ["The best referrals come from people who trust you — friends, study groups, communities you're active in. A genuine “here's what's actually working for me” beats spamming a link a hundred times."] },
      { heading: "Help people succeed", paragraphs: ["Your network earns when your referrals stay active. Point new members to the Help Center, share your first-week routine, and answer questions. Active referrals compound; abandoned ones don't."] },
      { heading: "Play the long game", paragraphs: ["A handful of engaged referrals beats hundreds of dormant sign-ups. Focus on quality, be honest about expectations, and let compounding do the work."] },
    ],
  },
  {
    slug: "5-ways-to-earn-in-your-spare-time",
    title: "5 realistic ways to earn in your spare time",
    excerpt: "Turn coffee breaks and commutes into real income — no special skills required.",
    category: "Guides",
    date: "2026-06-22",
    readMinutes: 5,
    author: "The EarnGPT Team",
    emoji: "⏱️",
    body: [
      { paragraphs: ["You don't need a side hustle that eats your evenings. A few focused minutes here and there add up. Five approachable ways to earn in the gaps of your day:"] },
      { heading: "1. Micro-tasks", paragraphs: ["Short, simple tasks you can knock out in a minute or two — perfect for a queue or a commute."] },
      { heading: "2. Paid surveys", paragraphs: ["Share your opinion and get paid for it. Fill out your profile so you're matched with surveys you actually qualify for."] },
      { heading: "3. Watch & engage", paragraphs: ["Get rewarded for watching short videos and discovering content — easy earning while you relax."] },
      { heading: "4. App & offer rewards", paragraphs: ["Try a new app or complete an offer and earn a reward for it. The offerwall shows exactly what's required before you start."] },
      { heading: "5. Referrals", paragraphs: ["Invite people you trust and earn a share of their activity long-term. See our referral guide for the details."] },
      { heading: "Stack them", paragraphs: ["The members who earn the most don't rely on one method — they mix a daily task routine with surveys and a growing referral network."] },
    ],
  },
  {
    slug: "understanding-payouts-and-withdrawals",
    title: "Understanding payouts: how and when you get paid",
    excerpt: "Everything about withdrawals — methods, minimums, timing, and how we keep payouts secure.",
    category: "Payments",
    date: "2026-06-08",
    readMinutes: 6,
    author: "The EarnGPT Team",
    emoji: "💸",
    body: [
      { paragraphs: ["Getting paid should be the easiest part. Here's exactly how payouts work, so there are no surprises when you cash out."] },
      { heading: "Choose your method", paragraphs: ["Withdraw the way that suits you: PayPal, bank transfer, Wise, Payoneer, Skrill, gift cards, or crypto (USDT/BTC). Available options can vary slightly by country."] },
      { heading: "Minimums and timing", paragraphs: ["Each method has a minimum withdrawal amount shown before you confirm. Most payouts are processed within 24–48 hours; crypto is usually faster."] },
      { heading: "Why we verify", paragraphs: ["To protect everyone, some withdrawals go through a quick review — especially larger amounts or new accounts. It keeps fraud out and real members paid."] },
      { heading: "Tips for smooth payouts", paragraphs: ["Complete identity verification early, double-check your payout details, and withdraw to accounts in your own name to avoid delays."] },
    ],
  },
  {
    slug: "how-we-keep-your-account-secure",
    title: "How we keep your account and money secure",
    excerpt: "A look under the hood at the security that protects your earnings and data.",
    category: "Trust & Safety",
    date: "2026-05-25",
    readMinutes: 5,
    author: "The EarnGPT Team",
    emoji: "🔒",
    body: [
      { paragraphs: ["Trust is the whole product. If you can't rely on getting paid and keeping your data safe, nothing else matters. Here's how we protect you."] },
      { heading: "Encryption everywhere", paragraphs: ["All traffic is encrypted in transit, and sensitive data is protected at rest. Payment details are handled by vetted, industry-standard processors."] },
      { heading: "Fraud detection", paragraphs: ["Automated systems and a human Trust & Safety team watch for abuse around the clock, keeping the platform clean so genuine members get paid."] },
      { heading: "You're in control", paragraphs: ["Two-factor authentication, login alerts, and account controls put security in your hands. We'll never ask for your password or one-time codes."], bullets: ["Enable two-factor authentication", "Use a unique password", "Review your login activity", "Report anything suspicious to support"] },
      { heading: "Privacy by default", paragraphs: ["We collect only what we need, never sell your personal data, and honor privacy rights like GDPR and CCPA. Read the Privacy Policy for the full picture."] },
    ],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function formatBlogDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[(m ?? 1) - 1]} ${d}, ${y}`;
}
