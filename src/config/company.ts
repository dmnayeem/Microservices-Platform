// Single source of truth for public brand / company identity. Used across the
// marketing pages, legal pages, and footer so the platform reads as one
// consistent, trustworthy global company.
//
// NOTE (owner): the app historically mixed `earngpt.app` and `earngpt.com`;
// on 2026-09-27 the brand became RevType, on `revtype.com`.
// The public support address is standardized to `.com` here — update every
// value below to your real details (email, socials, address) before launch.

export const COMPANY_NAME = "RevType";
/** Legal/operating entity shown on legal + about pages. */
export const COMPANY_LEGAL = "RevType Global";
export const FOUNDED_YEAR = 2021;

export const SUPPORT_EMAIL = "support@revtype.com";
export const PRESS_EMAIL = "press@revtype.com";
export const CAREERS_EMAIL = "careers@revtype.com";
export const LEGAL_EMAIL = "legal@revtype.com";

/** Neutral, remote-first global framing (no fabricated registration data). */
export const COMPANY_TAGLINE =
  "A freelance micro-task marketplace and digital skill-sharing community.";
/** One-paragraph description used by the About and Press pages (and llms.txt
 *  as a fallback). Every clause must stay true of the product — no member
 *  counts, payout totals or country counts. */
export const COMPANY_BOILERPLATE =
  `${COMPANY_NAME} is a freelance micro-task marketplace and digital ` +
  `skill-sharing community. Members complete short paid tasks posted by ` +
  `businesses and advertisers, sell digital products and freelance services, ` +
  `take or teach online courses, and earn affiliate commissions on sales they ` +
  `refer. The platform is funded by advertising, sponsored tasks and ` +
  `campaigns, marketplace fees and optional paid plans. ${COMPANY_NAME} is ` +
  `operated by ${COMPANY_LEGAL}.`;

/** Owner-claimable brand handles — replace with your real profile URLs. */
export const SOCIALS: Array<{ name: string; href: string }> = [
  { name: "X", href: "https://x.com/revtype" },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/revtype" },
  { name: "Facebook", href: "https://www.facebook.com/revtype" },
  { name: "Instagram", href: "https://www.instagram.com/revtype" },
  { name: "YouTube", href: "https://www.youtube.com/@revtype" },
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

/**
 * Payout methods the withdrawal flow supports (the `PaymentMethod` enum). Which
 * of them are switched on is an admin setting, so marketing copy must say
 * "where enabled" next to this list.
 */
export const PAYOUT_METHODS = [
  "PayPal",
  "Binance",
  "Bitget",
  "bKash",
  "Nagad",
  "Rocket",
];
