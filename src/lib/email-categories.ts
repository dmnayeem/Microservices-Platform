import { NotificationType } from "@/generated/prisma/client";
import { getSetting } from "@/lib/system-settings";

/**
 * Which automatic emails leave the platform — admin → Settings → Email →
 * "Which emails are sent".
 *
 * Every email the platform sends belongs to exactly one category, and
 * `sendNotificationEmail` refuses to send unless its category is on. The
 * category is a REQUIRED argument there, so a new email cannot be added
 * without deciding which switch governs it.
 *
 * Two kinds:
 *   - LOCKED — always sent, no switch: account access (verification, password
 *     reset), anything an admin sends by hand, and the suspension notice that
 *     carries the only way back in. Turning these off would lock users out, so
 *     the panel shows them as "always on" and the gate ignores stored values.
 *   - Switchable — every automatic notice. OFF unless the admin turns it on:
 *     at scale an email per task approval or achievement is real money.
 *
 * Turning an email off never removes the in-app notification or the push; it
 * only stops the email copy.
 */

export type EmailCategoryGroup = "always" | "account" | "activity" | "staff";

export interface EmailCategoryDef {
  key: string;
  label: string;
  description: string;
  group: EmailCategoryGroup;
  /** Always sent; cannot be switched off. */
  locked?: boolean;
  /** Default when the admin has never saved this switch. */
  defaultOn: boolean;
}

export const EMAIL_CATEGORIES = [
  // ── Always sent ──────────────────────────────────────────────────────────
  {
    key: "verification",
    label: "Email verification code / link",
    description: "Sent at sign-up and on 'resend'. Without it nobody can verify an account.",
    group: "always",
    locked: true,
    defaultOn: true,
  },
  {
    key: "password_reset",
    label: "Password reset",
    description: "The reset link a user asks for on the login page.",
    group: "always",
    locked: true,
    defaultOn: true,
  },
  {
    key: "admin_manual",
    label: "Emails an admin sends by hand",
    description: "Broadcasts, bulk email from the users list, test emails and replies to appeals.",
    group: "always",
    locked: true,
    defaultOn: true,
  },
  {
    key: "account_suspended",
    label: "Account suspended (with appeal link)",
    description: "A suspended user can't sign in, so this email is their only way to appeal.",
    group: "always",
    locked: true,
    defaultOn: true,
  },
  {
    key: "support_inbox",
    label: "Contact form → support inbox",
    description: "Goes to your own support address, not to users.",
    group: "always",
    locked: true,
    defaultOn: true,
  },

  // ── Account & money (automatic) ─────────────────────────────────────────
  {
    key: "welcome",
    label: "Welcome email",
    description: "One email after a new account is verified.",
    group: "account",
    defaultOn: false,
  },
  {
    key: "money",
    label: "Withdrawals, deposits & conversions",
    description: "Withdrawal processing / paid / returned, deposit approved / rejected, points converted to cash.",
    group: "account",
    defaultOn: false,
  },
  {
    key: "account_review",
    label: "KYC & creator applications",
    description: "KYC verified / rejected, creator or seller application decided.",
    group: "account",
    defaultOn: false,
  },
  {
    key: "billing",
    label: "Plans & blue badge",
    description: "Subscription or badge renewed, expired or ended.",
    group: "account",
    defaultOn: false,
  },

  // ── Activity (automatic) ────────────────────────────────────────────────
  { key: "notif_task", label: "Tasks", description: "Task approved, rejected, new task and similar.", group: "activity", defaultOn: false },
  { key: "notif_wallet", label: "Wallet activity", description: "Points / balance notices other than the money emails above.", group: "activity", defaultOn: false },
  { key: "notif_referral", label: "Referrals", description: "A referral joined, commission earned.", group: "activity", defaultOn: false },
  { key: "notif_achievement", label: "Achievements, levels & milestones", description: "Achievement unlocked, level up, milestone reached.", group: "activity", defaultOn: false },
  { key: "events", label: "Events", description: "Event reward paid, event proof not accepted.", group: "activity", defaultOn: false },
  { key: "notif_lottery", label: "Lottery", description: "Ticket bought, draw result, prize won.", group: "activity", defaultOn: false },
  { key: "notif_social", label: "Social / feed", description: "Follows, likes, comments, mentions.", group: "activity", defaultOn: false },
  { key: "notif_message", label: "Chat messages", description: "A new chat message.", group: "activity", defaultOn: false },
  { key: "notif_course", label: "Courses", description: "Enrolments, course updates, certificates.", group: "activity", defaultOn: false },
  { key: "notif_promotion", label: "Promotions", description: "Automatic promotional notices (not broadcasts you send).", group: "activity", defaultOn: false },
  { key: "notif_system", label: "Other system notices", description: "Everything else the platform notifies about.", group: "activity", defaultOn: false },

  // ── Staff ───────────────────────────────────────────────────────────────
  {
    key: "staff_alerts",
    label: "Staff alerts",
    description: "Company subscription bills about to lapse — sent to staff only, never to users.",
    group: "staff",
    defaultOn: true,
  },
] as const satisfies readonly EmailCategoryDef[];

export type EmailCategoryKey = (typeof EMAIL_CATEGORIES)[number]["key"];

export const EMAIL_CATEGORY_SETTING = "email.auto_categories";

export const EMAIL_CATEGORY_GROUP_LABELS: Record<EmailCategoryGroup, string> = {
  always: "Always sent (cannot be turned off)",
  account: "Account & money",
  activity: "Activity",
  staff: "Staff",
};

const BY_KEY = new Map<string, EmailCategoryDef>(EMAIL_CATEGORIES.map((c) => [c.key, c]));

export function isEmailCategoryKey(k: unknown): k is EmailCategoryKey {
  return typeof k === "string" && BY_KEY.has(k);
}

/** Effective on/off for every category (locked ones are always true). */
export async function getEmailCategoryState(): Promise<Record<EmailCategoryKey, boolean>> {
  const stored = await getSetting<Record<string, unknown> | null>(EMAIL_CATEGORY_SETTING, null);
  const out = {} as Record<EmailCategoryKey, boolean>;
  for (const c of EMAIL_CATEGORIES as readonly EmailCategoryDef[]) {
    const v = stored && typeof stored === "object" ? stored[c.key] : undefined;
    out[c.key as EmailCategoryKey] = c.locked ? true : typeof v === "boolean" ? v : c.defaultOn;
  }
  return out;
}

/** May an email of this category be sent right now? Fails CLOSED for switchable ones. */
export async function emailCategoryOn(key: EmailCategoryKey): Promise<boolean> {
  const def = BY_KEY.get(key);
  if (!def) return false;
  if (def.locked) return true;
  try {
    return (await getEmailCategoryState())[key];
  } catch {
    return false;
  }
}

/** The category an in-app notification's email copy belongs to. */
export function emailCategoryForNotificationType(type: NotificationType): EmailCategoryKey {
  switch (type) {
    case NotificationType.TASK:
      return "notif_task";
    case NotificationType.WALLET:
      return "notif_wallet";
    case NotificationType.REFERRAL:
      return "notif_referral";
    case NotificationType.ACHIEVEMENT:
      return "notif_achievement";
    case NotificationType.LOTTERY:
      return "notif_lottery";
    case NotificationType.SOCIAL:
      return "notif_social";
    case NotificationType.COURSE:
      return "notif_course";
    case NotificationType.MESSAGE:
      return "notif_message";
    case NotificationType.PROMOTION:
      return "notif_promotion";
    default:
      return "notif_system";
  }
}
