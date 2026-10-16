import "server-only";
import { deliverToUser } from "@/lib/notify";

/**
 * Email (+ push) for an application decision. The in-app notification row is
 * written by each program's own approve/reject code; this is the copy that
 * reaches the applicant outside the app.
 *
 * Locked category + transactional: the applicant asked and is waiting for the
 * answer, so neither the admin's automatic-email switches nor the member's
 * notification-email preference may swallow it. It used to ride on
 * "account_review", which is off by default — so nobody was ever emailed.
 * Never throws.
 */
export function sendApplicationDecision(opts: {
  userId: string;
  /** "Marketplace Seller", "Tutor", … */
  program: string;
  approved: boolean;
  adminNote?: string | null;
  /** Approved: the dashboard. Not approved: where to read it / re-apply. */
  link: string;
}): void {
  const note = opts.adminNote?.trim();
  const message = opts.approved
    ? `Good news — your ${opts.program} application was approved. You can start now.${note ? ` Note from the reviewer: ${note}` : ""}`
    : `Your ${opts.program} application was not approved this time.${note ? ` Note from the reviewer: ${note}` : ""} You can review the requirements and apply again later.`;
  void deliverToUser({
    userId: opts.userId,
    title: opts.approved ? `Approved: ${opts.program}` : `${opts.program} application update`,
    message,
    link: opts.link,
    category: "application_decision",
    transactional: true,
  });
}
