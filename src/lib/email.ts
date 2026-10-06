import { sendMail, getMailConfig } from "@/lib/mailer";
import { getPlatformName, getSetting } from "@/lib/system-settings";
import { getSeoSettings } from "@/lib/seo-settings";
import { customLogo } from "@/lib/brand-icons";
import { absoluteEmailUrl, toEmailSafeHtml } from "@/lib/email-html";
import { renderEmail, type EmailBrand, type EmailContent } from "@/lib/email-layout";
import { emailCategoryOn, type EmailCategoryKey } from "@/lib/email-categories";

// Host, port, credentials and the From header come from `lib/mailer.ts`, which
// reads the admin **Email settings** first and falls back to the env vars.
// Every template renders through `lib/email-layout.ts`, so the brand name,
// logo and footer are the same in all of them and come from settings — never a
// hard-coded name.
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com").replace(/\/+$/, "");

export type RenderedEmail = { subject: string; html: string; text: string };

/**
 * Brand for the email layout: platform name, logo (absolute — a mail client
 * cannot resolve `/api/media/…`), legal line and footer links.
 *
 * Never throws: a settings read that fails falls back to the platform name and
 * a text header, because a password reset must go out even when the brand
 * settings cannot be read.
 */
export async function getEmailBrand(): Promise<EmailBrand> {
  const name = await getPlatformName().catch(() => process.env.NEXT_PUBLIC_APP_NAME || "RevType");
  let logoUrl: string | null = null;
  let logoIsCustom = false;
  let legalName = "";
  let legalAddress = "";
  try {
    const seo = await getSeoSettings();
    logoIsCustom = customLogo(seo);
    logoUrl = absoluteEmailUrl(seo["seo.logo_url"] || "/icon-512.png", SITE_URL, "image");
    const [sellerName, sellerAddr] = await Promise.all([
      getSetting<string>("billing.seller_name", ""),
      getSetting<string>("billing.seller_address", ""),
    ]);
    legalName = String(sellerName || seo["seo.org_legal_name"] || "").trim();
    legalAddress = String(sellerAddr || seo["seo.org_address"] || "").trim().replace(/\s*\n\s*/g, ", ");
  } catch {
    logoUrl = absoluteEmailUrl("/icon-512.png", SITE_URL, "image");
  }
  const legalLine = [legalName, legalAddress].filter(Boolean).join(" · ") || null;
  return {
    name,
    siteUrl: SITE_URL,
    logoUrl,
    logoIsCustom,
    legalLine,
    helpUrl: `${SITE_URL}/help`,
    privacyUrl: `${SITE_URL}/privacy`,
  };
}

const ACCOUNT_REASON = (brand: EmailBrand) =>
  `You're receiving this because you have a ${brand.name} account.`;

/* ------------------------------------------------------------------ *
 * Transactional templates — rendering (pure given a brand) and sending
 * ------------------------------------------------------------------ */

export function renderVerificationEmail(brand: EmailBrand, token: string, name: string): RenderedEmail {
  const url = `${brand.siteUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const { html, text } = renderEmail(brand, {
    preheader: `Confirm your email to start using ${brand.name}.`,
    title: `Welcome to ${brand.name}, ${name}!`,
    bodyText: `Thanks for signing up. Please confirm your email address so we know it's really you — it takes one click.`,
    cta: { label: "Verify email address", url },
    showFallbackLink: true,
    footnote: "This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.",
    reason: `You're receiving this because this address was used to sign up for ${brand.name}.`,
  });
  return { subject: `Verify your ${brand.name} account`, html, text };
}

export function renderPasswordResetEmail(brand: EmailBrand, token: string, name: string): RenderedEmail {
  const url = `${brand.siteUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const { html, text } = renderEmail(brand, {
    preheader: "Use this link to choose a new password. It expires in 1 hour.",
    title: "Reset your password",
    bodyText: `Hi ${name},\n\nWe received a request to reset the password on your ${brand.name} account. Click the button below to choose a new one.`,
    cta: { label: "Reset password", url },
    showFallbackLink: true,
    footnote: "This link expires in 1 hour. If you didn't ask to reset your password, ignore this email — your password stays the same.",
    reason: ACCOUNT_REASON(brand),
  });
  return { subject: `Reset your ${brand.name} password`, html, text };
}

export function renderWelcomeEmail(brand: EmailBrand, name: string): RenderedEmail {
  const { html, text } = renderEmail(brand, {
    preheader: `Your ${brand.name} account is verified — here's how to start earning.`,
    style: "SUCCESS",
    title: `You're all set, ${name}!`,
    bodyHtml: toEmailSafeHtml(
      `<p>Your ${brand.name} account is verified and ready. Here's what you can do:</p>
       <ul><li>Complete tasks to earn points</li><li>Watch videos for instant rewards</li><li>Invite friends and earn commissions</li><li>Withdraw your earnings</li></ul>`,
      { baseUrl: brand.siteUrl }
    ).html,
    cta: { label: "Start earning", url: `${brand.siteUrl}/dashboard` },
    footnote: "Questions? Reply to this email or visit the Help Center.",
    reason: ACCOUNT_REASON(brand),
  });
  return { subject: `Welcome to ${brand.name}! Let's start earning`, html, text };
}

export async function sendVerificationEmail(email: string, token: string, name: string) {
  const m = renderVerificationEmail(await getEmailBrand(), token, name);
  await sendMail({ to: email, ...m, transactional: true });
}

export async function sendPasswordResetEmail(email: string, token: string, name: string) {
  const m = renderPasswordResetEmail(await getEmailBrand(), token, name);
  await sendMail({ to: email, ...m, transactional: true });
}

export async function sendWelcomeEmail(email: string, name: string) {
  // Optional, unlike verification and reset: admin → Settings → Email.
  if (!(await emailCategoryOn("welcome"))) return;
  const m = renderWelcomeEmail(await getEmailBrand(), name);
  await sendMail({ to: email, ...m, transactional: true });
}

/**
 * True when mail can actually be sent — admin **Email settings** first, env
 * vars as the fallback. Used to skip optional sends gracefully.
 */
export async function isSmtpConfigured(): Promise<boolean> {
  return (await getMailConfig()).configured;
}

/* ------------------------------------------------------------------ *
 * Notifications and broadcasts
 * ------------------------------------------------------------------ */

export type NotificationEmailOpts = {
  /**
   * `transactional` marks this as a service notice rather than marketing, which
   * is the difference between a message that reaches a registered user and one
   * that is silently dropped. `sendMail` refuses non-transactional mail while
   * the master "Email notifications" switch is off — correct for an offer,
   * wrong for "your withdrawal failed".
   */
  transactional?: boolean;
  /** Template id from `lib/notification-styles.ts` — colours the band, badge and button. */
  style?: string;
  /** Header artwork; relative paths and our own media are made absolute. */
  imageUrl?: string;
  /** Button text. Defaults to "View". */
  actionLabel?: string;
  /** Short line above the title, e.g. "Ends in 3 hours". */
  kicker?: string;
  /** Rich body (editor HTML). Made email-safe here; `message` is then ignored. */
  html?: string;
  /** Inbox preview line. Defaults to the start of the message. */
  preheader?: string;
  /**
   * Broadcast (bulk) mail: adds the Unsubscribe footer link and the RFC 8058
   * List-Unsubscribe headers. Never set for transactional mail.
   */
  unsubscribe?: { page: string; oneClick: string } | null;
};

/** Render a notification / broadcast email without sending it (preview, tests). */
export function renderNotificationEmail(
  brand: EmailBrand,
  title: string,
  message: string,
  link: string | undefined,
  opts: NotificationEmailOpts = {}
): RenderedEmail {
  const ctaUrl = link ? absoluteEmailUrl(link, brand.siteUrl, "link") : null;
  const bodyHtml = opts.html ? toEmailSafeHtml(opts.html, { baseUrl: brand.siteUrl }).html : undefined;
  const preheader =
    opts.preheader?.trim() ||
    (opts.kicker ? `${opts.kicker} — ` : "") + message.replace(/\s+/g, " ").trim().slice(0, 140);
  const content: EmailContent = {
    preheader,
    style: opts.style,
    kicker: opts.kicker,
    title,
    ...(bodyHtml ? { bodyHtml } : { bodyText: message }),
    heroImageUrl: opts.imageUrl ? absoluteEmailUrl(opts.imageUrl, brand.siteUrl, "image") : null,
    cta: ctaUrl ? { label: opts.actionLabel || "View", url: ctaUrl } : null,
    unsubscribeUrl: opts.unsubscribe?.page ?? null,
    reason: opts.unsubscribe
      ? `You're receiving this because you have a ${brand.name} account and email updates are on.`
      : ACCOUNT_REASON(brand),
  };
  const { html, text } = renderEmail(brand, content);
  return { subject: `${title} · ${brand.name}`, html, text };
}

/**
 * Generic notification email (title + message, or a rich HTML body) in the
 * branded layout. Best-effort — callers should catch/ignore errors.
 */
export async function sendNotificationEmail(
  email: string,
  title: string,
  message: string,
  link: string | undefined,
  opts: NotificationEmailOpts & {
    /**
     * Which switch governs this email (lib/email-categories.ts). Required, so
     * every new email has to pick one. Switchable categories are OFF unless
     * the admin turned them on; locked ones (account access, admin sends)
     * always go.
     */
    category: EmailCategoryKey;
  }
) {
  if (!(await emailCategoryOn(opts.category))) return;
  if (!(await isSmtpConfigured())) return;
  const [brand, cfg] = await Promise.all([getEmailBrand(), getMailConfig()]);
  const m = renderNotificationEmail(brand, title, message, link, opts);
  await sendMail({
    to: email,
    ...m,
    ...(opts.transactional ? { transactional: true } : {}),
    ...listUnsubscribeFor(opts.unsubscribe, cfg),
  });
}

/**
 * The List-Unsubscribe pair for a message: only when it is bulk mail that
 * carries an unsubscribe link (non-important broadcasts). Transactional mail
 * passes no `unsubscribe` and gets nothing.
 */
export function listUnsubscribeFor(
  unsubscribe: NotificationEmailOpts["unsubscribe"],
  cfg: { fromAddress: string; replyTo: string }
): { listUnsubscribe?: { url: string; mailto?: string } } {
  if (!unsubscribe) return {};
  const box = cfg.replyTo || cfg.fromAddress;
  return {
    listUnsubscribe: {
      url: unsubscribe.oneClick,
      ...(box ? { mailto: `mailto:${box}?subject=unsubscribe` } : {}),
    },
  };
}
