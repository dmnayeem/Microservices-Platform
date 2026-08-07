// Single source of truth for public brand / company identity. Used across the
// marketing pages, legal pages, and footer so the platform reads as one
// consistent, trustworthy global company.
//
// NOTE (owner): the app historically mixed `earngpt.app` and `earngpt.com`.
// The public support address is standardized to `.com` here — update every
// value below to your real details (email, socials, address) before launch.

export const COMPANY_NAME = "EarnGPT";
/** Legal/operating entity shown on legal + about pages. */
export const COMPANY_LEGAL = "EarnGPT Global";
export const FOUNDED_YEAR = 2021;

export const SUPPORT_EMAIL = "support@earngpt.com";
export const PRESS_EMAIL = "press@earngpt.com";
export const CAREERS_EMAIL = "careers@earngpt.com";
export const LEGAL_EMAIL = "legal@earngpt.com";

/** Neutral, remote-first global framing (no fabricated registration data). */
export const COMPANY_TAGLINE = "The global platform for earning online.";
export const COMPANY_BOILERPLATE =
  `${COMPANY_NAME} is a global rewards platform where people earn by completing ` +
  `simple online tasks, surveys, and offers — and cash out in their local ` +
  `currency or crypto. Operated by ${COMPANY_LEGAL}, a remote-first company, ` +
  `${COMPANY_NAME} serves members across 180+ countries with round-the-clock ` +
  `support and secure, on-time payouts.`;

/** Owner-claimable brand handles — replace with your real profile URLs. */
export const SOCIALS: Array<{ name: string; href: string }> = [
  { name: "X", href: "https://x.com/earngpt" },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/earngpt" },
  { name: "Facebook", href: "https://www.facebook.com/earngpt" },
  { name: "Instagram", href: "https://www.instagram.com/earngpt" },
  { name: "YouTube", href: "https://www.youtube.com/@earngpt" },
];

/** Headline markets we operate in (name + flag emoji), used on About / trust strips. */
export const GLOBAL_COUNTRIES: Array<{ name: string; flag: string }> = [
  { name: "United States", flag: "🇺🇸" },
  { name: "United Kingdom", flag: "🇬🇧" },
  { name: "Germany", flag: "🇩🇪" },
  { name: "Canada", flag: "🇨🇦" },
  { name: "Australia", flag: "🇦🇺" },
  { name: "Mexico", flag: "🇲🇽" },
  { name: "UAE", flag: "🇦🇪" },
  { name: "Qatar", flag: "🇶🇦" },
  { name: "Spain", flag: "🇪🇸" },
  { name: "Japan", flag: "🇯🇵" },
  { name: "India", flag: "🇮🇳" },
  { name: "Bangladesh", flag: "🇧🇩" },
  { name: "Russia", flag: "🇷🇺" },
  { name: "Brazil", flag: "🇧🇷" },
  { name: "Nigeria", flag: "🇳🇬" },
  { name: "Philippines", flag: "🇵🇭" },
  { name: "Indonesia", flag: "🇮🇩" },
  { name: "France", flag: "🇫🇷" },
];

/** Global payout rails advertised on marketing pages (not the payment backend). */
export const PAYOUT_METHODS = [
  "PayPal",
  "Visa / Mastercard",
  "Bank transfer",
  "Wise",
  "Payoneer",
  "Skrill",
  "Apple Pay",
  "Crypto (USDT / BTC)",
];
