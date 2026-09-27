import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getSetting } from "@/lib/system-settings";

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
  /** False when the admin has switched outgoing email off entirely. */
  enabled: boolean;
  /** False when there is no usable host/user/pass from either source. */
  configured: boolean;
}

function str(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s || fallback;
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
  ] = await Promise.all([
    getSetting<string>("smtp_host", ""),
    getSetting<number>("smtp_port", 0),
    getSetting<string>("smtp_username", ""),
    getSetting<string>("smtp_password", ""),
    getSetting<string>("email_from_address", ""),
    getSetting<string>("email_from_name", ""),
    getSetting<boolean>("email_notifications_enabled", true),
    getSetting<string>("platform_name", ""),
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
  const name = str(
    fromName,
    str(platformName, process.env.NEXT_PUBLIC_APP_NAME ?? "RevType")
  );

  return {
    host: h,
    port: prt,
    // 465 is implicit TLS; anything else is STARTTLS. The env var still wins
    // for the deployments that set it explicitly.
    secure: process.env.SMTP_SECURE === "true" || prt === 465,
    user: u,
    pass: p,
    fromAddress: addr,
    fromName: name,
    from: `${name} <${addr}>`,
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
  text?: string;
  /** Send even when "Email notifications" is off (verification, password reset). */
  transactional?: boolean;
}): Promise<boolean> {
  const cfg = await getMailConfig();
  if (!cfg.enabled && !opts.transactional) return false;
  if (!cfg.configured) throw new Error("MAIL_NOT_CONFIGURED");

  await buildTransport(cfg).sendMail({
    from: cfg.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.text ? { text: opts.text } : {}),
  });
  return true;
}
