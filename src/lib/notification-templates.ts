/**
 * Saved notification templates — the composer fields an admin can keep and
 * reuse. The audience is deliberately NOT part of a template: who receives a
 * notice is chosen fresh on every send, so an old "specific users" pick can
 * never be re-sent by accident.
 *
 * Shared by the composer (client) and /api/admin/notifications/templates, so
 * the two agree on exactly what a template holds.
 */
export interface NotificationTemplateContent {
  type: string;
  title: string;
  message: string;
  priority: string;
  style: string;
  kicker: string;
  imageUrl: string;
  actionUrl: string;
  actionLabel: string;
  sendInApp: boolean;
  sendPush: boolean;
  sendEmail: boolean;
  important: boolean;
  emailSubject: string;
  emailBody: string;
  emailFormat: "text" | "rich";
  emailHtml: string;
  emailPreheader: string;
}

export interface SavedNotificationTemplate {
  id: string;
  name: string;
  content: NotificationTemplateContent;
  usageCount: number;
  lastUsedAt: string | null;
  updatedAt: string;
}

/**
 * A notification's title and message limits — the ONE definition the composer,
 * the send route and templates all read. They used to be three: the form
 * stopped at 50/200 while the server took 80/500, so a template could hold text
 * the form then refused to send. 60 keeps a title to two lines in the bell
 * menu and readable in a phone's push banner; the full message shows on the
 * Notifications page (the bell menu cuts it at three lines).
 */
export const NOTIFICATION_TITLE_MAX = 60;
export const NOTIFICATION_MESSAGE_MAX = 500;

/** Max length per text field — the send route's own limits where it has one. */
const TEXT_LIMITS: Record<string, number> = {
  type: 30,
  title: NOTIFICATION_TITLE_MAX,
  message: NOTIFICATION_MESSAGE_MAX,
  priority: 10,
  style: 40,
  kicker: 60,
  imageUrl: 2000,
  actionUrl: 2000,
  actionLabel: 60,
  emailSubject: 200,
  emailBody: 20_000,
  emailHtml: 200_000,
  emailPreheader: 300,
};
const BOOL_FIELDS = ["sendInApp", "sendPush", "sendEmail", "important"] as const;

export const TEMPLATE_NAME_MAX = 80;

/**
 * Whitelists and bounds a template body. Returns the clean content, or an
 * error naming the first bad field.
 */
export function cleanTemplateContent(
  raw: unknown
): { ok: true; content: NotificationTemplateContent } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Template content is missing" };
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, max] of Object.entries(TEXT_LIMITS)) {
    const v = r[k] ?? "";
    if (typeof v !== "string") return { ok: false, error: `Invalid ${k}` };
    if (v.length > max) return { ok: false, error: `${k} is too long (max ${max} characters)` };
    out[k] = v;
  }
  for (const k of BOOL_FIELDS) out[k] = r[k] === true;
  out.emailFormat = r.emailFormat === "rich" ? "rich" : "text";
  if (!(out.title as string).trim() && !(out.message as string).trim()) {
    return { ok: false, error: "Write a title or message before saving" };
  }
  return { ok: true, content: out as unknown as NotificationTemplateContent };
}
