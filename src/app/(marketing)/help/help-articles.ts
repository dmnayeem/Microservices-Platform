/**
 * The help-center questions. Shared by the page (the accordion) and its
 * layout (the FAQPage structured data that lets search and AI answers quote
 * them) — one list, so the two can never disagree.
 */
export const HELP_CATEGORIES: Array<{ title: string; articles: Array<{ q: string; a: string }> }> = [
  {
    title: "Getting started",
    articles: [
      { q: "How do I create an account?", a: "Tap Sign Up, enter your email, and verify it — that's it. Creating an account is free and takes under a minute." },
      { q: "How do I earn?", a: "Complete simple tasks, paid surveys, watch-and-engage activities, and offers. You can also earn by referring people you trust and from daily bonuses." },
      { q: "Is it really free?", a: "Yes. It's free to join and free to earn. We never ask you to pay to withdraw — legitimate platforms pay you, not the other way around." },
      { q: "Which countries is it available in?", a: "EarnGPT works in 180+ countries. Some payout methods and offers vary by region, and you'll always see what's available to you." },
    ],
  },
  {
    title: "Earning & tasks",
    articles: [
      { q: "What kinds of tasks are there?", a: "Micro-tasks, quizzes, paid surveys, video and social activities, app/offer rewards, and more. Each task shows exactly what's required before you start." },
      { q: "How long does approval take?", a: "Most tasks approve instantly. A few need a quick manual review, which usually completes within 24 hours." },
      { q: "Why was my submission rejected?", a: "Usually invalid or incomplete proof, a duplicate, or a fraud flag. You'll get a note explaining the specific reason so you can fix it next time." },
      { q: "How do referrals work?", a: "Invite people with your link and earn a commission on their qualifying activity across multiple levels — without reducing what they earn." },
    ],
  },
  {
    title: "Withdrawals & payments",
    articles: [
      { q: "How do I withdraw my earnings?", a: "Convert your points to cash and request a withdrawal to your chosen method. You'll see the minimum amount before you confirm." },
      { q: "What payout methods are supported?", a: "PayPal, bank transfer, Wise, Payoneer, Skrill, gift cards, and crypto (USDT/BTC). Availability can vary slightly by country." },
      { q: "How long do withdrawals take?", a: "Most payouts are processed within 24–48 hours; crypto is usually faster. Larger or first-time withdrawals may go through a quick security review." },
      { q: "Why do you verify some withdrawals?", a: "To protect everyone and keep fraud out, so genuine members always get paid. Completing identity verification early keeps your payouts fast." },
    ],
  },
  {
    title: "Account & security",
    articles: [
      { q: "How do I keep my account secure?", a: "Use a unique, strong password and enable two-factor authentication. We'll never ask for your password or one-time codes." },
      { q: "I can't log in — what do I do?", a: "Reset your password from the login page. If you're still stuck, contact support and we'll help you recover access." },
      { q: "How is my data protected?", a: "Traffic is encrypted, sensitive data is protected, and we honor privacy rights like GDPR and CCPA. We never sell your personal data." },
      { q: "How do I delete my account?", a: "You can request deletion from your account settings. It's permanent, so make sure you've withdrawn any balance first." },
    ],
  },
];
