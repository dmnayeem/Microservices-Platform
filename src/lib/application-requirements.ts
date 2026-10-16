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
  "DEALS",
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
  /** Extra questions every applicant answers (rendered in the program's form). */
  questions: ApplicationQuestion[];
}

export const QUESTION_TYPES = ["text", "textarea", "url", "select", "number"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  text: "Short text",
  textarea: "Long text",
  url: "Link (URL)",
  select: "Pick one",
  number: "Number",
};

export interface ApplicationQuestion {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  /** Choices for `select` only. */
  options?: string[];
}

/** An answer as stored with the application. The label is copied so a later
 *  edit of the question does not change what the applicant was asked. */
export interface StoredAnswer {
  id: string;
  label: string;
  answer: string;
}

export const MAX_QUESTIONS = 15;
/** Longest answer accepted per type. */
export const ANSWER_MAX: Record<QuestionType, number> = {
  text: 300,
  textarea: 2000,
  url: 500,
  select: 100,
  number: 30,
};

export type RequirementsConfig = Record<ProgramKey, ProgramRequirements>;

export const APPLICATION_REQUIREMENTS_KEY = "applications.requirements";

export const DEFAULT_PROGRAM_REQUIREMENTS: ProgramRequirements = {
  enabled: true,
  minLevel: 0,
  kycRequired: false,
  minProfilePercent: 0,
  minAccountDays: 0,
  note: "",
  questions: [],
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
    questions: normalizeQuestions(r.questions),
  };
}

export function newQuestionId(): string {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeQuestions(raw: unknown): ApplicationQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ApplicationQuestion[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_QUESTIONS) break;
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const label = typeof q.label === "string" ? q.label.trim().slice(0, 200) : "";
    if (!label) continue;
    let id = typeof q.id === "string" ? q.id.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) : "";
    if (!id || seen.has(id)) id = newQuestionId();
    seen.add(id);
    let type: QuestionType = (QUESTION_TYPES as readonly string[]).includes(q.type as string)
      ? (q.type as QuestionType)
      : "text";
    const options =
      type === "select" && Array.isArray(q.options)
        ? [...new Set(q.options.map((o) => String(o ?? "").trim().slice(0, 100)).filter(Boolean))].slice(0, 20)
        : [];
    // A "pick one" with nothing to pick would block every applicant.
    if (type === "select" && options.length === 0) type = "text";
    out.push({ id, label, type, required: q.required === true, ...(type === "select" ? { options } : {}) });
  }
  return out;
}

/**
 * Check submitted answers against the program's questions. Shared by the
 * forms (instant feedback) and the apply APIs (the real check). Unknown ids
 * are ignored; every stored answer is a trimmed string.
 */
export function validateAnswers(
  questions: ApplicationQuestion[],
  raw: unknown
): { ok: true; answers: StoredAnswer[] } | { ok: false; error: string } {
  const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const answers: StoredAnswer[] = [];
  for (const q of questions) {
    const v = given[q.id];
    const a = typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
    if (!a) {
      if (q.required) return { ok: false, error: `Please answer: ${q.label}` };
      continue;
    }
    if (a.length > ANSWER_MAX[q.type]) {
      return { ok: false, error: `${q.label}: too long (max ${ANSWER_MAX[q.type]} characters).` };
    }
    if (q.type === "url") {
      let okUrl = false;
      try {
        const u = new URL(a);
        okUrl = u.protocol === "https:" || u.protocol === "http:";
      } catch {
        okUrl = false;
      }
      if (!okUrl) return { ok: false, error: `${q.label}: enter a full link starting with https://` };
    }
    if (q.type === "number" && !Number.isFinite(Number(a))) {
      return { ok: false, error: `${q.label}: enter a number.` };
    }
    if (q.type === "select" && !(q.options ?? []).includes(a)) {
      return { ok: false, error: `${q.label}: pick one of the options.` };
    }
    answers.push({ id: q.id, label: q.label, answer: a });
  }
  return { ok: true, answers };
}

/**
 * Tutor and ambassador applications have no JSON column, so their answers are
 * appended to the free-text field as a readable block under this marker and
 * split back out for display.
 */
export const ANSWERS_MARKER = "--- Application questions ---";

export function answersToText(answers: StoredAnswer[]): string {
  if (!answers.length) return "";
  // Continuation lines are indented so a typed "Q: " cannot start a new entry.
  const body = answers.map((a) => `Q: ${a.label}\nA: ${a.answer.replace(/\r?\n/g, "\n   ")}`).join("\n\n");
  return `\n\n${ANSWERS_MARKER}\n${body}`;
}

export type AnswerView = { label: string; answer: string };

export function splitAnswersText(text: string | null | undefined): { body: string; answers: AnswerView[] } {
  const t = text ?? "";
  const at = t.indexOf(ANSWERS_MARKER);
  if (at < 0) return { body: t, answers: [] };
  const answers: AnswerView[] = [];
  for (const chunk of t.slice(at + ANSWERS_MARKER.length).split(/^Q: /m).slice(1)) {
    const i = chunk.indexOf("\nA: ");
    if (i < 0) continue;
    answers.push({ label: chunk.slice(0, i).trim(), answer: chunk.slice(i + 4).replace(/\n {3}/g, "\n").trim() });
  }
  return { body: t.slice(0, at).trim(), answers };
}

/** Answers saved on a CreatorApplication (`payload.answers`). */
export function answersFromPayload(payload: unknown): AnswerView[] {
  const a = payload && typeof payload === "object" ? (payload as { answers?: unknown }).answers : null;
  if (!Array.isArray(a)) return [];
  return a
    .filter((x): x is StoredAnswer => !!x && typeof x === "object" && typeof (x as StoredAnswer).label === "string")
    .map((x) => ({ label: x.label, answer: String(x.answer ?? "") }));
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
  | "handshake"
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
  /** Who reviews it on the admin side (null: nothing to review). */
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
  DEALS: {
    key: "DEALS",
    label: "Escrow Deals",
    blurb: "Hire sellers through escrow deals — your money is held until the order is delivered.",
    benefits: [
      "Start and fund escrow deals with sellers",
      "Money is released only when the work is delivered",
      "Admin mediation if something goes wrong",
    ],
    icon: "handshake",
    flowHref: null,
    dashboardHref: "/marketplace/messages",
    adminHref: "/admin/creators?type=DEALS",
  },
  BLUE_BADGE: {
    key: "BLUE_BADGE",
    label: "Blue Badge",
    blurb: "A verified badge next to your name. Apply for a review, or buy it.",
    benefits: [
      "Verified badge on your profile and posts",
      "Optional badge styles",
      "Stand out to buyers and followers",
    ],
    icon: "badge",
    // Applied for through the shared form; the badge shop (/badge) is offered
    // next to it as "Buy it now".
    flowHref: null,
    dashboardHref: "/badge",
    adminHref: "/admin/creators?type=BLUE_BADGE",
  },
};

/** Where /apply?type=X points for a program. */
export const applyHrefFor = (key: ProgramKey) => `/apply?type=${key}`;
