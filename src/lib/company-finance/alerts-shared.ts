/**
 * Finance alerts — what the finance team is told about, and how. Client-safe
 * (the Alerts tab renders these); the sending lives in ./alerts.ts.
 *
 * Every alert has its own switch: on/off, in-app notification, email, and —
 * for the ones that warn ahead — how many days before. Stored as one
 * SystemSetting (`finance.alerts`); a missing key means the default below.
 */

export type FinanceAlertType =
  | "SUBSCRIPTION_RENEWAL"
  | "RECURRING_DUE"
  | "BILL_OVERDUE"
  | "WITHDRAWAL_REQUEST"
  | "DEPOSIT_REQUEST";

export interface FinanceAlertRule {
  enabled: boolean;
  inApp: boolean;
  email: boolean;
  /** Only for the alerts that warn ahead (RECURRING_DUE). */
  daysBefore?: number;
}

export type FinanceAlertSettings = Record<FinanceAlertType, FinanceAlertRule>;

export const FINANCE_ALERTS_KEY = "finance.alerts";

export const FINANCE_ALERT_DEFS: {
  type: FinanceAlertType;
  label: string;
  description: string;
  /** Shows the "days before" box. */
  hasDays?: boolean;
}[] = [
  {
    type: "RECURRING_DUE",
    label: "Recurring bill coming up",
    description:
      "Rent, internet, servers, salaries — every bill on the Recurring tab — a set number of days before it is due each month. Not sent when that month is already paid. (Yearly renewals — domains, hosting — are under Subscription renewal.)",
    hasDays: true,
  },
  {
    type: "SUBSCRIPTION_RENEWAL",
    label: "Subscription renewal",
    description:
      "Domains, hosting, software on the Subscriptions tab — before each renews or expires (the days are set on each subscription; 30, 7 and 1 by default).",
  },
  {
    type: "BILL_OVERDUE",
    label: "Bill overdue",
    description: "A bill still unpaid after its due date — the day after, and again a week later.",
  },
  {
    type: "WITHDRAWAL_REQUEST",
    label: "New withdrawal request",
    description: "A user asked to withdraw money and it is waiting for approval.",
  },
  {
    type: "DEPOSIT_REQUEST",
    label: "New manual deposit",
    description: "A user sent a deposit with a transaction id and it is waiting for approval.",
  },
];

export const FINANCE_ALERT_DEFAULTS: FinanceAlertSettings = {
  RECURRING_DUE: { enabled: true, inApp: true, email: true, daysBefore: 7 },
  SUBSCRIPTION_RENEWAL: { enabled: true, inApp: true, email: true },
  BILL_OVERDUE: { enabled: true, inApp: true, email: true },
  WITHDRAWAL_REQUEST: { enabled: true, inApp: true, email: false },
  DEPOSIT_REQUEST: { enabled: true, inApp: true, email: false },
};

/** Whatever is stored → a complete, valid settings object. */
export function normalizeFinanceAlerts(raw: unknown): FinanceAlertSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as FinanceAlertSettings;
  for (const def of FINANCE_ALERT_DEFS) {
    const d = FINANCE_ALERT_DEFAULTS[def.type];
    const v = (r[def.type] && typeof r[def.type] === "object" ? r[def.type] : {}) as Record<string, unknown>;
    const rule: FinanceAlertRule = {
      enabled: typeof v.enabled === "boolean" ? v.enabled : d.enabled,
      inApp: typeof v.inApp === "boolean" ? v.inApp : d.inApp,
      email: typeof v.email === "boolean" ? v.email : d.email,
    };
    if (def.hasDays) {
      const n = Math.round(Number(v.daysBefore));
      rule.daysBefore = Number.isFinite(n) ? Math.min(60, Math.max(1, n)) : d.daysBefore;
    }
    out[def.type] = rule;
  }
  return out;
}
