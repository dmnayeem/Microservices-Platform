/**
 * The Applications center: every program a member can apply to (or buy, for
 * the blue badge), and the extra requirements an admin can put in front of
 * each one.
 *
 * Client-safe — no prisma. The evaluation against a real user lives in
 * `application-requirements-server.ts`; this file is shared by the user hub
 * (/apply), the public page (/programs) and the admin editor.
 *
 * Stored as ONE JSON SystemSetting (`applications.requirements`). A program
 * missing from it — or a stored value that does not parse — falls back to
 * "open, no extra requirements", so nothing changes until the admin sets one.
 */

export const PROGRAM_KEYS = [
  "MARKETPLACE_SELLER",
  "SERVICE_PROVIDER",
  "TASK_BUYER",
  "ADVERTISER",
  "AGENCY",
  "AFFILIATE",
  "TUTOR",
  "AMBASSADOR",
  "BLUE_BADGE",
] as const;

export type ProgramKey = (typeof PROGRAM_KEYS)[number];

export function isProgramKey(v: unknown): v is ProgramKey {
  return typeof v === "string" && (PROGRAM_KEYS as readonly string[]).includes(v);
}

export interface ProgramRequirements {
  /** Off: the program takes no new applications (or badge purchases). */
  enabled: boolean;
  /** 0 = no minimum. */
  minLevel: number;
  kycRequired: boolean;
  /** Profile ring percentage, 0–100. 0 = no minimum. */
  minProfilePercent: number;
  /** Days since sign-up. 0 = no minimum. */
  minAccountDays: number;
  /** Shown to applicants on the program card. */
  note: string;
}

export type RequirementsConfig = Record<ProgramKey, ProgramRequirements>;

export const APPLICATION_REQUIREMENTS_KEY = "applications.requirements";

export const DEFAULT_PROGRAM_REQUIREMENTS: ProgramRequirements = {
  enabled: true,
  minLevel: 0,
  kycRequired: false,
  minProfilePercent: 0,
  minAccountDays: 0,
  note: "",
};

const int = (v: unknown, min: number, max: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

export function normalizeProgramRequirements(raw: unknown): ProgramRequirements {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_PROGRAM_REQUIREMENTS;
  return {
    enabled: r.enabled === undefined ? d.enabled : r.enabled !== false,
    minLevel: r.minLevel === undefined ? d.minLevel : int(r.minLevel, 0, 500),
    kycRequired: r.kycRequired === true,
    minProfilePercent: r.minProfilePercent === undefined ? d.minProfilePercent : int(r.minProfilePercent, 0, 100),
    minAccountDays: r.minAccountDays === undefined ? d.minAccountDays : int(r.minAccountDays, 0, 3650),
    note: typeof r.note === "string" ? r.note.trim().slice(0, 500) : "",
  };
}

export function normalizeRequirementsConfig(raw: unknown): RequirementsConfig {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as RequirementsConfig;
  for (const k of PROGRAM_KEYS) out[k] = normalizeProgramRequirements(r[k]);
  return out;
}

export type ProgramIcon =
  | "store"
  | "briefcase"
  | "target"
  | "megaphone"
  | "building"
  | "share"
  | "graduation"
  | "medal"
  | "badge";

export interface ProgramMeta {
  key: ProgramKey;
  label: string;
  /** One line: what it is. */
  blurb: string;
  /** What the member gets once approved. */
  benefits: string[];
  icon: ProgramIcon;
  /**
   * Programs with their own flow (tutor form, ambassador page, badge shop) link
   * out; creator types apply through the shared form on /apply.
   */
  flowHref: string | null;
  /** Where an approved member goes. */
  dashboardHref: string;
  /** Who reviews it on the admin side (null: nothing to review, e.g. a purchase). */
  adminHref: string | null;
}

export const PROGRAMS: Record<ProgramKey, ProgramMeta> = {
  MARKETPLACE_SELLER: {
    key: "MARKETPLACE_SELLER",
    label: "Marketplace Seller",
    blurb: "Sell digital products, templates and assets on the marketplace.",
    benefits: [
      "Your own listings in the marketplace",
      "Instant delivery of digital files to buyers",
      "Earnings paid to your wallet",
    ],
    icon: "store",
    flowHref: null,
    dashboardHref: "/marketplace/create",
    adminHref: "/admin/creators?type=MARKETPLACE_SELLER",
  },
  SERVICE_PROVIDER: {
    key: "SERVICE_PROVIDER",
    label: "Service Provider",
    blurb: "Offer your skills as services — design, writing, video, marketing and more.",
    benefits: [
      "A service page buyers can order from",
      "Get paid per order",
      "Build ratings and repeat clients",
    ],
    icon: "briefcase",
    flowHref: null,
    dashboardHref: "/services/create",
    adminHref: "/admin/creators?type=SERVICE_PROVIDER",
  },
  TASK_BUYER: {
    key: "TASK_BUYER",
    label: "Task Buyer",
    blurb: "Pay members to follow, share or complete a job you set.",
    benefits: [
      "Create your own paid tasks, including social tasks",
      "You choose the reward and how many people",
      "Review proof and approve the work",
    ],
    icon: "target",
    flowHref: null,
    dashboardHref: "/create-task",
    adminHref: "/admin/creators?type=TASK_BUYER",
  },
  ADVERTISER: {
    key: "ADVERTISER",
    label: "Advertiser",
    blurb: "Run ad campaigns and promote your brand across the platform.",
    benefits: [
      "Self-serve ad campaigns",
      "Buy ad credit and set your own budget",
      "Campaign reporting",
    ],
    icon: "megaphone",
    flowHref: null,
    dashboardHref: "/advertiser",
    adminHref: "/admin/creators?type=ADVERTISER",
  },
  AGENCY: {
    key: "AGENCY",
    label: "Promotion Agency",
    blurb: "Run promotions and manage ads and tasks at scale for clients.",
    benefits: [
      "Agency console",
      "Create tasks and ad campaigns",
      "Manage work for several clients",
    ],
    icon: "building",
    flowHref: null,
    dashboardHref: "/agency",
    adminHref: "/admin/creators?type=AGENCY",
  },
  AFFILIATE: {
    key: "AFFILIATE",
    label: "Affiliate",
    blurb: "Earn commissions by promoting products and courses with your link.",
    benefits: [
      "A personal tracking link for every product and course",
      "Commission on every sale you refer",
      "Affiliate dashboard with clicks and sales",
    ],
    icon: "share",
    flowHref: null,
    dashboardHref: "/affiliate",
    adminHref: "/admin/creators?type=AFFILIATE",
  },
  TUTOR: {
    key: "TUTOR",
    label: "Tutor",
    blurb: "Create and sell courses, and earn from every enrollment.",
    benefits: [
      "Tutor dashboard and course builder",
      "Earn from every enrollment",
      "Certificates for your students",
    ],
    icon: "graduation",
    flowHref: "/profile/become-tutor",
    dashboardHref: "/tutor/dashboard",
    adminHref: "/admin/tutors/applications",
  },
  AMBASSADOR: {
    key: "AMBASSADOR",
    label: "Ambassador",
    blurb: "Bring in active members and earn a monthly ambassador bonus.",
    benefits: [
      "Points for every active member you bring in",
      "A monthly target bonus",
      "Ambassador status on the platform",
    ],
    icon: "medal",
    flowHref: "/ambassador",
    dashboardHref: "/ambassador",
    adminHref: "/admin/ambassadors",
  },
  BLUE_BADGE: {
    key: "BLUE_BADGE",
    label: "Blue Badge",
    blurb: "A verified badge next to your name, renewed monthly.",
    benefits: [
      "Verified badge on your profile and posts",
      "Optional badge styles",
      "Stand out to buyers and followers",
    ],
    icon: "badge",
    flowHref: "/badge",
    dashboardHref: "/badge",
    adminHref: null,
  },
};

/** Where /apply?type=X points for a program. */
export const applyHrefFor = (key: ProgramKey) => `/apply?type=${key}`;
