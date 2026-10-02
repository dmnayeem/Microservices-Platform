import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { randomUUID } from "crypto";
import { getSetting } from "@/lib/system-settings";
import { emailHtmlToText } from "@/lib/email-html";

/**
 * One place that decides how mail leaves the platform.
 *
 * The admin **Email settings** tab has always had SMTP host / port / username /
 * password / from-address / from-name boxes, and every one of them wrote a
 * `SystemSetting` row that **nothing ever read** — `lib/email.ts` built its
 * transporter from `process.env` at module load, and `/api/admin/settings/
 * test-email` did the same. So an owner could fill the form in, press Save, get
 * a success toast, press "Send test email", and be told "SMTP not configured".
 *
 * Now the saved settings are the configuration and the env vars are the
 * fallback, which keeps existing deployments (where only env is set) working
 * untouched.
 *
 * The transporter is rebuilt when the settings change rather than held at module
 * scope, because a module-scope transporter can only ever reflect the values
 * that existed when the process booted — that is what made the form dead in the
 * first place. `getSetting` is itself cached, so this is not a query per email.
 */
export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  /** Bare address mail is sent from. */
  fromAddress: string;
  /** Display name on the From header. */
  fromName: string;
  /** Ready-made `Name <addr>` From header. */
  from: string;
  /** Where replies go: setting `email_reply_to`, else the From address. */
  replyTo: string;
  /** Domain of the From address — the Message-ID and the DNS checks use it. */
  fromDomain: string;
  /** False when the admin has switched outgoing email off entirely. */
  enabled: boolean;
  /** False when there is no usable host/user/pass from either source. */
  configured: boolean;
}

function str(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s || fallback;
}

/**
 * Where an admin's test email goes: setting `email_test_recipient` when it is a
 * valid address, else the admin's own account email.
 */
export async function testRecipient(accountEmail: string | null | undefined): Promise<string | null> {
  const v = await getSetting<string>("email_test_recipient", "");
  const s = typeof v === "string" ? v.trim() : "";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s;
  return accountEmail || null;
}

export async function getMailConfig(): Promise<MailConfig> {
  const [
    host,
    port,
    user,
    pass,
    fromAddress,
    fromName,
    enabled,
    platformName,
    replyTo,
  ] = await Promise.all([
    getSetting<string>("smtp_host", ""),
    getSetting<number>("smtp_port", 0),
    getSetting<string>("smtp_username", ""),
    getSetting<string>("smtp_password", ""),
    getSetting<string>("email_from_address", ""),
    getSetting<string>("email_from_name", ""),
    getSetting<boolean>("email_notifications_enabled", true),
    getSetting<string>("platform_name", ""),
    getSetting<string>("email_reply_to", ""),
  ]);

  const h = str(host, process.env.SMTP_HOST ?? "");
  const u = str(user, process.env.SMTP_USER ?? "");
  const p = str(pass, process.env.SMTP_PASSWORD ?? "");
  const prt =
    Number(port) > 0
      ? Number(port)
      : parseInt(process.env.SMTP_PORT || "587", 10) || 587;

  const addr = str(
    fromAddress,
    process.env.SMTP_FROM || process.env.EMAIL_FROM || u
  );
  // Display names cannot carry quotes or angle brackets unescaped; strip them
  // rather than send a From header some providers reject.
  const name = str(
    fromName,
    str(platformName, process.env.NEXT_PUBLIC_APP_NAME ?? "RevType")
  ).replace(/["<>\r\n]/g, "");
  // EMAIL_FROM is sometimes written as `Name <addr>` — take the address only,
  // or the header becomes `RevType <Old Name <addr>>`.
  const bareAddr = (addr.match(/<([^>]+)>/)?.[1] ?? addr).trim();
  const reply = str(replyTo, bareAddr);

  return {
    host: h,
    port: prt,
    // 465 is implicit TLS; anything else is STARTTLS. The env var still wins
    // for the deployments that set it explicitly.
    secure: process.env.SMTP_SECURE === "true" || prt === 465,
    user: u,
    pass: p,
    fromAddress: bareAddr,
    fromName: name,
    from: `"${name}" <${bareAddr}>`,
    replyTo: reply,
    fromDomain: (bareAddr.split("@")[1] ?? "").toLowerCase(),
    enabled: enabled !== false,
    configured: Boolean(h && u && p),
  };
}

export function buildTransport(cfg: MailConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

/**
 * Send one message using the current configuration.
 *
 * Throws `MAIL_NOT_CONFIGURED` when there is no host/user/pass anywhere, so a
 * caller that needs to tell the admin *why* nothing arrived can say so. Callers
 * that send optional mail (notifications) should catch it.
 *
 * Returns `false` — without throwing — when the admin has turned outgoing email
 * off. That is a deliberate configuration, not a failure.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  /** Plain-text part. Generated from the HTML when omitted — every mail has one. */
  text?: string;
  /** Send even when "Email notifications" is off (verification, password reset). */
  transactional?: boolean;
  /**
   * Bulk/marketing mail only (broadcasts): the RFC 8058 one-click unsubscribe
   * pair Gmail and Yahoo require from bulk senders. Never set on transactional
   * mail — a password reset must not offer "unsubscribe".
   */
  listUnsubscribe?: { url: string; mailto?: string };
}): Promise<boolean> {
  const cfg = await getMailConfig();
  if (!cfg.enabled && !opts.transactional) return false;
  if (!cfg.configured) throw new Error("MAIL_NOT_CONFIGURED");

  await buildTransport(cfg).sendMail(buildMessage(cfg, opts));
  return true;
}

/**
 * The full nodemailer message — exported so scripts/verify-email.ts can assert
 * the headers without sending anything.
 *
 * Deliverability headers, all of which a missing one costs inbox placement:
 *   - Message-ID on OUR domain (nodemailer's default uses the SMTP host name,
 *     which does not align with the From domain);
 *   - Date, explicitly;
 *   - Reply-To, so replies reach a mailbox somebody reads;
 *   - a text/plain alternative.
 * `Precedence: bulk` is deliberately NOT sent — Gmail's sender guidelines say
 * not to, and it suppresses auto-replies people sometimes want.
 */
export function buildMessage(
  cfg: MailConfig,
  opts: { to: string; subject: string; html: string; text?: string; listUnsubscribe?: { url: string; mailto?: string } }
) {
  const domain = cfg.fromDomain || "localhost";
  const headers: Record<string, string> = {};
  if (opts.listUnsubscribe) {
    const parts = [`<${opts.listUnsubscribe.url}>`];
    if (opts.listUnsubscribe.mailto) parts.push(`<${opts.listUnsubscribe.mailto}>`);
    headers["List-Unsubscribe"] = parts.join(", ");
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return {
    from: cfg.from,
    to: opts.to,
    replyTo: cfg.replyTo || cfg.fromAddress,
    subject: opts.subject,
    html: opts.html,
    text: opts.text?.trim() ? opts.text : emailHtmlToText(opts.html),
    messageId: `<${randomUUID()}@${domain}>`,
    date: new Date(),
    ...(Object.keys(headers).length ? { headers } : {}),
  };
}
