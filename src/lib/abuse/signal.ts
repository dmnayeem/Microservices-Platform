/**
 * One way in for every abuse signal — an infected upload, a phishing link, an
 * outbound-fetch flood, a fraud pattern, a user report. The Abuse Center
 * (/admin/abuse) turns these into cases an admin can act on in one place.
 *
 * Callers never block on this and it never throws: recording a signal must not
 * break the upload / post / task it came from.
 */

export type AbuseSignalKind =
  | "UPLOAD_BLOCKED" // disguised executable, bad content type
  | "UPLOAD_SUSPICIOUS" // archive with executables, scan hit, quarantined
  | "LINK_UNSAFE" // Safe Browsing / blocklist hit
  | "OUTBOUND_LIMIT" // a user made the server fetch too much
  | "FRAUD_PATTERN" // bot-like behaviour, many accounts per device, etc.
  | "USER_REPORT" // someone reported content
  | "PROVIDER_COMPLAINT"; // host / network / advertiser complaint (manual)

export type AbuseSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AbuseSignal {
  kind: AbuseSignalKind;
  severity: AbuseSeverity;
  /** The account responsible, when known. */
  userId?: string | null;
  /** What it concerns: "post", "listing", "task", "ad", "upload", "profile", "cpa"… */
  entityType?: string;
  entityId?: string | null;
  /** One human sentence for the admin list. */
  summary: string;
  /** Evidence kept as-is (URLs, file names, scan results, IPs). */
  evidence?: Record<string, unknown>;
}

/**
 * Record a signal. Implemented by the Abuse Center (src/lib/abuse/cases.ts);
 * fire-and-forget from every caller.
 */
export function raiseAbuseSignal(signal: AbuseSignal): void {
  void import("./cases")
    .then((m) => m.recordAbuseSignal(signal))
    .catch((e) => {
      console.error("[abuse] could not record signal", signal.kind, e);
    });
}
