/**
 * What adds to a user's task-fraud risk, and how much by default. Client-safe
 * (no prisma) so the settings screen can list them; `fraud-risk.ts` applies
 * them, with per-signal overrides from `antifraud.risk_points`.
 */
export const FRAUD_SIGNALS = {
  ADMIN_FRAUD_REJECT: {
    points: 34,
    label: "Rejected by a reviewer as cheating",
  },
  KEY_OF_ANOTHER_USER: {
    points: 25,
    label: "Submitted an article key issued to someone else",
  },
  DUPLICATE_PROOF: {
    points: 15,
    label: "Proof matched another user's (link, username or screenshot)",
  },
  WRONG_UNIQUE_KEY: {
    points: 10,
    label: "Submitted a wrong article key",
  },
  MULTIPLE_ACCOUNTS: {
    points: 10,
    label: "More accounts on one device than allowed — or over the IP limit when that is set to block (once a day)",
  },
  VPN_DETECTED: {
    points: 5,
    label: "Worked through a VPN / datacenter IP (once a day)",
  },
} as const;
export type FraudSignal = keyof typeof FRAUD_SIGNALS;
