/**
 * The one email layout. Every message the platform sends — verification,
 * password reset, receipts, notifications, broadcasts, the SMTP test — is
 * rendered here, so the brand, the footer and the colours cannot drift between
 * templates again (they had: four hand-copied dark templates, each with its
 * own footer).
 *
 * Client-safe and pure: the brand is passed in (`getEmailBrand()` in
 * lib/email.ts loads it), so the preview route and scripts/verify-email.ts
 * render exactly what is sent.
 *
 * Email-client rules this follows on purpose:
 *   - tables for layout, every style inline, no <style>, no CSS animation
 *     (Gmail strips <style> and @keyframes);
 *   - a light card: dark-background mail is what Gmail/Outlook "dark mode"
 *     mangles worst, and light text on a light inversion is unreadable;
 *   - a "bulletproof" button (a link inside a coloured table cell) so it still
 *     looks like a button with images off;
 *   - a hidden preheader, padded so the body text does not leak into the inbox
 *     preview line.
 */
import { notificationStyle } from "@/lib/notification-styles";
import { EMAIL_FONT, EMAIL_HEADING, EMAIL_INK, emailHtmlToText, escapeHtml } from "@/lib/email-html";

export type EmailBrand = {
  /** Platform name from settings — never hard-coded. */
  name: string;
  /** Public origin, no trailing slash, e.g. https://revtype.com */
  siteUrl: string;
  /** Absolute logo URL, or null for the text-only header. */
  logoUrl: string | null;
  /** True when the logo is the admin's upload (a wordmark that already says the name). */
  logoIsCustom: boolean;
  /** "Business name · address" from the invoice settings, or null when unset. */
  legalLine: string | null;
  helpUrl: string;
  privacyUrl: string;
};

export type EmailContent = {
  /** The grey line after the subject in the inbox list. */
  preheader?: string;
  /** Template id from lib/notification-styles.ts. */
  style?: string;
  kicker?: string;
  title: string;
  /** Email-safe HTML (see toEmailSafeHtml) — or use `bodyText`. */
  bodyHtml?: string;
  /** Plain text; escaped and given paragraph breaks. */
  bodyText?: string;
  /** Absolute https image shown full-width above the text. */
  heroImageUrl?: string | null;
  cta?: { label: string; url: string } | null;
  /** Show "if the button doesn't work, paste this link" under the button. */
  showFallbackLink?: boolean;
  /** Small print inside the card (e.g. "This link expires in 1 hour."). */
  footnote?: string;
  /** Broadcasts only: the one-click unsubscribe page. */
  unsubscribeUrl?: string | null;
  /** Why the reader got this, shown in the footer. */
  reason?: string;
};

const PAGE_BG = "#f3f4f6";
const HEADER_BG = "#0f172a";
const MUTED = "#6b7280";

export function textToEmailHtml(s: string): string {
  return escapeHtml(s)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:${EMAIL_INK};">${p.replace(/\n/g, "<br />")}</p>`
    )
    .join("");
}

function preheaderBlock(text: string): string {
  if (!text) return "";
  // The zero-width filler keeps Gmail/Apple Mail from pulling the first words
  // of the body into the preview after the preheader runs out.
  const filler = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<div style="display:none;font-size:1px;color:${PAGE_BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(text)}${filler}</div>`;
}

function header(brand: EmailBrand): string {
  const name = escapeHtml(brand.name);
  const home = escapeHtml(brand.siteUrl + "/");
  let inner: string;
  if (brand.logoUrl && brand.logoIsCustom) {
    // An uploaded wordmark already says the name; the alt text says it when
    // images are blocked, styled to read on the dark band.
    inner = `<a href="${home}" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(brand.logoUrl)}" alt="${name}" height="36" style="display:block;height:36px;width:auto;max-width:220px;border:0;outline:none;color:#ffffff;font-size:22px;font-weight:800;${EMAIL_FONT}" /></a>`;
  } else if (brand.logoUrl) {
    inner = `<a href="${home}" target="_blank" style="text-decoration:none;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding:0 10px 0 0;"><img src="${escapeHtml(brand.logoUrl)}" alt="" width="32" height="32" style="display:block;width:32px;height:32px;border:0;border-radius:8px;" /></td>
      <td style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.01em;${EMAIL_FONT}">${name}</td>
    </tr></table></a>`;
  } else {
    inner = `<a href="${home}" target="_blank" style="color:#ffffff;font-size:20px;font-weight:800;text-decoration:none;${EMAIL_FONT}">${name}</a>`;
  }
  return `<tr><td style="background:${HEADER_BG};padding:20px 32px;border-radius:12px 12px 0 0;">${inner}</td></tr>`;
}

function button(label: string, url: string, bg: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px 0;"><tr>
    <td align="center" bgcolor="${bg}" style="background:${bg};border-radius:8px;">
      <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:700;line-height:1.2;text-decoration:none;border-radius:8px;${EMAIL_FONT}">${escapeHtml(label)}</a>
    </td>
  </tr></table>`;
}

export function renderEmail(brand: EmailBrand, c: EmailContent): { html: string; text: string } {
  const def = notificationStyle(c.style);
  const decorated = def.id !== "PLAIN";
  const accent = def.mail.accent;
  const year = new Date().getFullYear();
  const bodyHtml = c.bodyHtml ?? textToEmailHtml(c.bodyText ?? "");

  const band = `<tr><td style="background:${accent};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>`;
  const hero = c.heroImageUrl
    ? `<tr><td style="background:#ffffff;padding:0;"><img src="${escapeHtml(c.heroImageUrl)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" /></td></tr>`
    : "";
  // Badge: dark ink on a pale tint of the same hue — readable everywhere,
  // including the dark-mode inversions that turned white-on-blue into
  // black-on-blue.
  const badge = decorated
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;"><tr><td bgcolor="${def.mail.soft}" style="background:${def.mail.soft};border:1px solid ${accent};border-radius:999px;padding:4px 12px;color:${def.mail.ink};font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;${EMAIL_FONT}">${escapeHtml(def.label)}</td></tr></table>`
    : "";
  const kicker = c.kicker
    ? `<p style="margin:0 0 6px 0;color:${accent};font-size:14px;font-weight:700;${EMAIL_FONT}">${escapeHtml(c.kicker)}</p>`
    : "";
  const cta = c.cta
    ? button(c.cta.label, c.cta.url, accent) +
      (c.showFallbackLink
        ? `<p style="margin:12px 0 0 0;font-size:13px;line-height:1.5;color:${MUTED};">If the button doesn't work, copy this link into your browser:<br /><a href="${escapeHtml(c.cta.url)}" style="color:${accent};word-break:break-all;">${escapeHtml(c.cta.url)}</a></p>`
        : "")
    : "";
  const footnote = c.footnote
    ? `<p style="margin:24px 0 0 0;padding:16px 0 0 0;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.55;color:${MUTED};">${escapeHtml(c.footnote)}</p>`
    : "";

  const linkStyle = `color:${MUTED};text-decoration:underline;`;
  const footerLinks = [
    `<a href="${escapeHtml(brand.helpUrl)}" style="${linkStyle}">Help</a>`,
    `<a href="${escapeHtml(brand.privacyUrl)}" style="${linkStyle}">Privacy</a>`,
    ...(c.unsubscribeUrl ? [`<a href="${escapeHtml(c.unsubscribeUrl)}" style="${linkStyle}">Unsubscribe</a>`] : []),
  ].join(" &nbsp;&middot;&nbsp; ");

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(c.title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};${EMAIL_FONT}">
${preheaderBlock(c.preheader ?? "")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE_BG}" style="background:${PAGE_BG};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    ${header(brand)}
    ${band}
    ${hero}
    <tr><td bgcolor="#ffffff" style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px;${EMAIL_FONT}">
      ${badge}
      ${kicker}
      <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;font-weight:800;color:${EMAIL_HEADING};${EMAIL_FONT}">${escapeHtml(c.title)}</h1>
      ${bodyHtml}
      ${cta}
      ${footnote}
    </td></tr>
    <tr><td align="center" style="padding:24px 16px 8px 16px;font-size:12px;line-height:1.6;color:${MUTED};${EMAIL_FONT}">
      ${c.reason ? `<p style="margin:0 0 8px 0;">${escapeHtml(c.reason)}</p>` : ""}
      <p style="margin:0 0 8px 0;">${footerLinks}</p>
      <p style="margin:0;">&copy; ${year} ${escapeHtml(brand.name)}${brand.legalLine ? ` &middot; ${escapeHtml(brand.legalLine)}` : ""}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    brand.name,
    "",
    ...(c.kicker ? [c.kicker] : []),
    c.title,
    "",
    emailHtmlToText(bodyHtml),
    ...(c.cta ? ["", `${c.cta.label}: ${c.cta.url}`] : []),
    ...(c.footnote ? ["", c.footnote] : []),
    "",
    "--",
    ...(c.reason ? [c.reason] : []),
    `Help: ${brand.helpUrl}`,
    `Privacy: ${brand.privacyUrl}`,
    ...(c.unsubscribeUrl ? [`Unsubscribe: ${c.unsubscribeUrl}`] : []),
    `(c) ${year} ${brand.name}${brand.legalLine ? ` - ${brand.legalLine}` : ""}`,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text };
}
