/**
 * Company finance & HR — the vocabulary, shared by the server and the admin UI.
 *
 * Client-safe: no prisma, no server imports. Every list the UI offers as a
 * dropdown is defined here once, so a status the server accepts is a status
 * the screen can show, and the two can never disagree about what "VOID" means.
 */

export const ENTRY_KINDS = ["EXPENSE", "INCOME", "TAX_PAYMENT"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  EXPENSE: "Expense",
  INCOME: "Other income",
  TAX_PAYMENT: "Tax paid to authority",
};

export const ENTRY_STATUSES = ["PENDING", "PAID", "VOID"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY", "INTERN"] as const;
export const EMPLOYMENT_TYPE_LABEL: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  DAILY: "Daily wage",
  INTERN: "Intern",
};

export const EMPLOYEE_STATUSES = ["ACTIVE", "ON_LEAVE", "LEFT"] as const;
export const EMPLOYEE_STATUS_LABEL: Record<(typeof EMPLOYEE_STATUSES)[number], string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  LEFT: "Left",
};

export const SALARY_CYCLES = ["MONTHLY", "WEEKLY", "DAILY"] as const;

export const PAYEE_KINDS = ["COMPANY", "PERSON", "PLATFORM"] as const;
export type PayeeKind = (typeof PAYEE_KINDS)[number];
export const PAYEE_KIND_LABEL: Record<PayeeKind, string> = {
  COMPANY: "Company",
  PERSON: "Person",
  PLATFORM: "Platform / service",
};

export const FIELD_ENTITIES = ["ENTRY", "EMPLOYEE", "PAYEE"] as const;
export type FieldEntity = (typeof FIELD_ENTITIES)[number];

export const FIELD_TYPES = ["TEXT", "TEXTAREA", "NUMBER", "DATE", "SELECT", "URL"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** What an entry was paid with. Free text is allowed too; these are the usual. */
export const PAYMENT_METHODS = ["Cash", "Bank transfer", "bKash", "Nagad", "Rocket", "Card", "Cheque", "Other"];

/** Tax labels the register groups by. Free text is allowed; these are offered. */
export const TAX_LABELS = ["VAT", "Income tax", "AIT", "Withholding tax", "Other tax"];

/**
 * The categories a new install starts with.
 *
 * Seeded by slug, so re-seeding is a no-op and an admin who renames "Office
 * rent" to "Rent — Gulshan" keeps their name: the slug, not the label, is what
 * identifies the row. Every one of the owner's examples is here — salary,
 * commission, paying a company / a person / a platform, electricity, gas,
 * internet, server, rent, office staff — plus the costs every office has next.
 */
export const DEFAULT_CATEGORIES: {
  slug: string;
  name: string;
  kind: EntryKind;
  color: string;
  icon: string;
}[] = [
  { slug: "salary", name: "Salaries", kind: "EXPENSE", color: "#6366f1", icon: "Users" },
  { slug: "commission", name: "Commissions", kind: "EXPENSE", color: "#8b5cf6", icon: "Percent" },
  { slug: "office-staff", name: "Office staff wages", kind: "EXPENSE", color: "#a855f7", icon: "UserCog" },
  { slug: "rent", name: "Office rent", kind: "EXPENSE", color: "#f59e0b", icon: "Building2" },
  { slug: "electricity", name: "Electricity", kind: "EXPENSE", color: "#eab308", icon: "Zap" },
  { slug: "gas", name: "Gas", kind: "EXPENSE", color: "#f97316", icon: "Flame" },
  { slug: "water", name: "Water", kind: "EXPENSE", color: "#0ea5e9", icon: "Droplets" },
  { slug: "internet", name: "Internet", kind: "EXPENSE", color: "#06b6d4", icon: "Wifi" },
  { slug: "server", name: "Servers & hosting", kind: "EXPENSE", color: "#14b8a6", icon: "Server" },
  { slug: "software", name: "Software & subscriptions", kind: "EXPENSE", color: "#10b981", icon: "AppWindow" },
  { slug: "marketing", name: "Marketing & ads", kind: "EXPENSE", color: "#ec4899", icon: "Megaphone" },
  { slug: "vendor", name: "Company / vendor payments", kind: "EXPENSE", color: "#64748b", icon: "Briefcase" },
  { slug: "contractor", name: "Freelancers & contractors", kind: "EXPENSE", color: "#78716c", icon: "UserCheck" },
  { slug: "platform-fees", name: "Platform & payment fees", kind: "EXPENSE", color: "#94a3b8", icon: "CreditCard" },
  { slug: "supplies", name: "Office supplies", kind: "EXPENSE", color: "#84cc16", icon: "Package" },
  { slug: "maintenance", name: "Repairs & maintenance", kind: "EXPENSE", color: "#a3a3a3", icon: "Wrench" },
  { slug: "travel", name: "Travel & transport", kind: "EXPENSE", color: "#22c55e", icon: "Car" },
  { slug: "food", name: "Food & refreshments", kind: "EXPENSE", color: "#fb923c", icon: "Coffee" },
  { slug: "legal", name: "Legal & professional", kind: "EXPENSE", color: "#475569", icon: "Scale" },
  { slug: "misc", name: "Miscellaneous", kind: "EXPENSE", color: "#71717a", icon: "Ellipsis" },
  { slug: "other-income", name: "Other income", kind: "INCOME", color: "#22c55e", icon: "TrendingUp" },
  { slug: "tax-vat", name: "VAT paid to authority", kind: "TAX_PAYMENT", color: "#ef4444", icon: "Landmark" },
  { slug: "tax-income", name: "Income tax paid", kind: "TAX_PAYMENT", color: "#dc2626", icon: "Landmark" },
];

/* ------------------------------------------------------------------ *
 * Periods — a UTC calendar month, `YYYY-MM`
 * ------------------------------------------------------------------ */

export function isPeriod(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftPeriod(p: string, months: number): string {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return periodOf(d);
}

/** Every period from `from` to `to` inclusive, oldest first. Capped at 120. */
export function periodsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let p = from;
  while (p <= to && out.length < 120) {
    out.push(p);
    p = shiftPeriod(p, 1);
  }
  return out;
}

export function periodLabel(p: string): string {
  if (!isPeriod(p)) return p;
  const [y, m] = p.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* ------------------------------------------------------------------ *
 * Custom fields
 * ------------------------------------------------------------------ */

export type FieldDef = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  required: boolean;
};

/** Turn an admin-typed label into a stable key. Used only when creating one. */
export function fieldKeyFrom(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field"
  );
}

/**
 * Check the custom-field values of a row against its definitions.
 *
 * Returns a cleaned copy holding only defined keys — an old key from a field
 * that was since deactivated is dropped rather than carried forever — and the
 * first problem found, written for an admin.
 */
export function validateCustomFields(
  defs: FieldDef[],
  raw: unknown
): { values: Record<string, string>; error: string | null } {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const values: Record<string, string> = {};
  for (const d of defs) {
    const v = input[d.key];
    const str = v === null || v === undefined ? "" : String(v).trim();
    if (!str) {
      if (d.required) return { values, error: `"${d.label}" is required` };
      continue;
    }
    if (d.type === "NUMBER" && !Number.isFinite(Number(str))) {
      return { values, error: `"${d.label}" must be a number` };
    }
    if (d.type === "DATE" && Number.isNaN(Date.parse(str))) {
      return { values, error: `"${d.label}" must be a date` };
    }
    if (d.type === "URL" && !/^https?:\/\//i.test(str)) {
      return { values, error: `"${d.label}" must be a link starting with http` };
    }
    if (d.type === "SELECT" && d.options.length && !d.options.includes(str)) {
      return { values, error: `"${d.label}" must be one of: ${d.options.join(", ")}` };
    }
    values[d.key] = str.slice(0, d.type === "TEXTAREA" ? 4000 : 500);
  }
  return { values, error: null };
}
