/**
 * Member warnings (Fraud Monitor → Warn). Shared by the admin composer, the
 * admin API, the member API and the pop-up, so all four agree.
 *
 * A warning is answered or it comes back: closing it without a reply hides it
 * for REASK_MINUTES, then it pops up again on the next page the member opens.
 */
export const WARNING_TEXT_MAX = 1000;
export const WARNING_REPLY_MAX = 1000;
export const REASK_MINUTES = 10;

/** What the member's pop-up receives. */
export interface ActiveWarning {
  id: string;
  issue: string;
  consequence: string;
  createdAt: string;
  /** Warnings this member has had in total, this one included. */
  total: number;
  /** Times this one was closed without a reply. */
  dismissCount: number;
}

/**
 * Starting text for the admin's Warn form, by fraud event type. Only a draft:
 * the admin edits it before sending.
 */
const SUGGESTIONS: Record<string, { issue: string; consequence: string }> = {
  MULTIPLE_ACCOUNTS: {
    issue: "Several accounts have been created from your network.",
    consequence:
      "Each person may have only one account. If more accounts are used, all of them can be suspended and their earnings cancelled.",
  },
  MULTIPLE_ACCOUNTS_DEVICE: {
    issue: "More than one account has been used on your device.",
    consequence:
      "Only one account per person and device is allowed. If it continues, the accounts can be suspended or permanently banned and their earnings cancelled.",
  },
  MULTIPLE_ACCOUNTS_FINGERPRINT: {
    issue: "Your browser matches another account on the platform.",
    consequence:
      "If you are running more than one account, stop now. Duplicate accounts can be suspended or banned and their earnings cancelled.",
  },
};

const GENERIC = {
  issue: "We noticed activity on your account that breaks the platform rules.",
  consequence:
    "If it continues, your account can be suspended or permanently banned and any earnings from it cancelled.",
};

export function suggestWarning(eventType: string | null | undefined): { issue: string; consequence: string } {
  return (eventType && SUGGESTIONS[eventType]) || GENERIC;
}
