import { sendMail, getMailConfig } from "@/lib/mailer";
import { getPlatformName } from "@/lib/system-settings";
import { notificationStyle } from "@/lib/notification-styles";

// Host, port, credentials and the From header now come from `lib/mailer.ts`,
// which reads the admin **Email settings** first and falls back to the env
// vars. This file used to build a nodemailer transport at module load from
// `process.env` alone, which is why every box on that settings tab was dead.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function sendVerificationEmail(
  email: string,
  token: string,
  name: string
) {
  const APP_NAME = await getPlatformName();
  const verifyUrl = `${APP_URL}/verify-email?token=${token}`;
  const currentYear = new Date().getFullYear();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0f;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
          <td>
            <div style="background: linear-gradient(145deg, #14141f, #1a1a25); border-radius: 16px; padding: 40px; border: 1px solid #2a2a3a;">
              <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0; text-align: center;">
                Welcome to <span style="background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${APP_NAME}</span>!
              </h1>
              <p style="color: #a0a0b0; font-size: 16px; text-align: center; margin: 0 0 30px 0;">
                Hi ${name}, thanks for signing up!
              </p>

              <p style="color: #a0a0b0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                Please verify your email address to start earning with ${APP_NAME}. Click the button below to confirm your account:
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Verify Email Address
                </a>
              </div>

              <p style="color: #6a6a7a; font-size: 13px; margin: 20px 0 0 0;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="color: #6366f1; font-size: 13px; word-break: break-all; margin: 8px 0 0 0;">
                ${verifyUrl}
              </p>

              <hr style="border: none; border-top: 1px solid #2a2a3a; margin: 30px 0;">

              <p style="color: #6a6a7a; font-size: 12px; margin: 0; text-align: center;">
                This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
              </p>
            </div>

            <p style="color: #6a6a7a; font-size: 12px; text-align: center; margin: 20px 0 0 0;">
              &copy; ${currentYear} ${APP_NAME}. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await sendMail({
    to: email,
    subject: `Verify your ${APP_NAME} account`,
    html,
    transactional: true,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  name: string
) {
  const APP_NAME = await getPlatformName();
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  const currentYear = new Date().getFullYear();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0f;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
          <td>
            <div style="background: linear-gradient(145deg, #14141f, #1a1a25); border-radius: 16px; padding: 40px; border: 1px solid #2a2a3a;">
              <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0; text-align: center;">
                Password Reset
              </h1>
              <p style="color: #a0a0b0; font-size: 16px; text-align: center; margin: 0 0 30px 0;">
                Hi ${name}, we received a request to reset your password.
              </p>

              <p style="color: #a0a0b0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                Click the button below to create a new password:
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Reset Password
                </a>
              </div>

              <p style="color: #6a6a7a; font-size: 13px; margin: 20px 0 0 0;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="color: #6366f1; font-size: 13px; word-break: break-all; margin: 8px 0 0 0;">
                ${resetUrl}
              </p>

              <hr style="border: none; border-top: 1px solid #2a2a3a; margin: 30px 0;">

              <p style="color: #6a6a7a; font-size: 12px; margin: 0; text-align: center;">
                This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
              </p>
            </div>

            <p style="color: #6a6a7a; font-size: 12px; text-align: center; margin: 20px 0 0 0;">
              &copy; ${currentYear} ${APP_NAME}. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await sendMail({
    to: email,
    subject: `Reset your ${APP_NAME} password`,
    html,
    transactional: true,
  });
}

export async function sendWelcomeEmail(email: string, name: string) {
  const APP_NAME = await getPlatformName();
  const currentYear = new Date().getFullYear();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ${APP_NAME}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0f;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
          <td>
            <div style="background: linear-gradient(145deg, #14141f, #1a1a25); border-radius: 16px; padding: 40px; border: 1px solid #2a2a3a;">
              <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0; text-align: center;">
                Welcome to <span style="background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${APP_NAME}</span>!
              </h1>
              <p style="color: #a0a0b0; font-size: 16px; text-align: center; margin: 0 0 30px 0;">
                Your account is now verified and ready to use!
              </p>

              <p style="color: #a0a0b0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                Hi ${name},<br><br>
                Congratulations! Your ${APP_NAME} account is now active. Here's what you can do:
              </p>

              <ul style="color: #a0a0b0; font-size: 15px; line-height: 1.8; margin: 0 0 20px 0; padding-left: 20px;">
                <li>Complete tasks to earn points</li>
                <li>Watch videos for instant rewards</li>
                <li>Invite friends and earn commissions</li>
                <li>Withdraw your earnings anytime</li>
              </ul>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${APP_URL}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Start Earning Now
                </a>
              </div>

              <hr style="border: none; border-top: 1px solid #2a2a3a; margin: 30px 0;">

              <p style="color: #6a6a7a; font-size: 12px; margin: 0; text-align: center;">
                Have questions? Contact our support team anytime.
              </p>
            </div>

            <p style="color: #6a6a7a; font-size: 12px; text-align: center; margin: 20px 0 0 0;">
              &copy; ${currentYear} ${APP_NAME}. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await sendMail({
    to: email,
    subject: `Welcome to ${APP_NAME}! Let's start earning`,
    html,
    transactional: true,
  });
}

/**
 * True when mail can actually be sent — admin **Email settings** first, env
 * vars as the fallback. Used to skip optional sends gracefully.
 *
 * This was env-only and synchronous, which meant an owner who configured SMTP
 * entirely through the admin screen still had every notification email skipped.
 */
export async function isSmtpConfigured(): Promise<boolean> {
  return (await getMailConfig()).configured;
}

/**
 * Generic transactional notification email (title + message) with the app's
 * dark branded template. Best-effort — callers should catch/ignore errors.
 */
export async function sendNotificationEmail(
  email: string,
  title: string,
  message: string,
  link?: string,
  /**
   * `transactional` marks this as a service notice rather than marketing, which
   * is the difference between a message that reaches a registered user and one
   * that is silently dropped. `sendMail` refuses non-transactional mail while
   * the master "Email notifications" switch is off — correct for an offer,
   * wrong for "your withdrawal failed".
   */
  opts: {
    transactional?: boolean;
    /** Template id from `lib/notification-styles.ts` — colours the band and button. */
    style?: string;
    /** Header artwork. Must be a public absolute URL; mail clients cannot see our proxy. */
    imageUrl?: string;
    /** Button text. Defaults to "View". */
    actionLabel?: string;
    /** Short line above the title, e.g. "Ends in 3 hours". */
    kicker?: string;
  } = {}
) {
  if (!(await isSmtpConfigured())) return;
  const APP_NAME = await getPlatformName();
  const currentYear = new Date().getFullYear();
  const def = notificationStyle(opts.style);
  const decorated = def.id !== "PLAIN";

  const abs = (u: string) => (u.startsWith("http") ? u : `${APP_URL}${u}`);

  // No CSS animation here on purpose. Gmail strips `@keyframes` and `<style>`
  // entirely, and a template that relies on motion arrives as a blank block in
  // the client most of these addresses actually use. Attention in email is
  // bought with a colour band, a loud badge and a large button — all of which
  // survive inlining.
  const band = decorated
    ? `<tr><td style="background:${def.mail.accent};height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>`
    : "";

  const badge = decorated
    ? `<span style="display:inline-block;background:${def.mail.accent};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:5px 10px;border-radius:5px;">${escapeHtml(def.label)}</span>`
    : "";

  const kicker = opts.kicker
    ? `<p style="color:${def.mail.accent};font-size:13px;font-weight:600;margin:14px 0 0 0;">${escapeHtml(opts.kicker)}</p>`
    : "";

  const hero = opts.imageUrl
    ? `<tr><td style="padding:0;"><img src="${abs(opts.imageUrl)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" /></td></tr>`
    : "";

  const cta = link
    ? `<table cellpadding="0" cellspacing="0" style="margin:26px 0 0 0;"><tr>
         <td style="background:${def.mail.accent};border-radius:8px;">
           <a href="${abs(link)}" style="display:inline-block;color:#ffffff;text-decoration:none;padding:14px 34px;font-weight:700;font-size:15px;">${escapeHtml(opts.actionLabel || "View")}</a>
         </td>
       </tr></table>`
    : "";

  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,sans-serif;background-color:#0a0a0f;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:32px 16px;">
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#14141f;border-radius:16px;overflow:hidden;border:1px solid ${decorated ? def.mail.accent + "55" : "#2a2a3a"};">
            ${band}
            ${hero}
            <tr><td style="padding:30px 32px 34px 32px;">
              ${badge}
              ${kicker}
              <h1 style="color:#ffffff;font-size:23px;line-height:1.3;margin:14px 0 12px 0;font-weight:800;">${escapeHtml(title)}</h1>
              <div style="color:#b4b4c4;font-size:15px;line-height:1.65;">${paragraphs(message)}</div>
              ${cta}
            </td></tr>
          </table>
          <p style="color:#6a6a7a;font-size:12px;text-align:center;margin:20px 0 0 0;">&copy; ${currentYear} ${APP_NAME}. All rights reserved.</p>
        </td></tr>
      </table>
    </body></html>`;

  await sendMail({
    to: email,
    subject: `${title} · ${APP_NAME}`,
    html,
    ...(opts.transactional ? { transactional: true } : {}),
  });
}

/**
 * The body is admin-typed plain text, not HTML.
 *
 * Interpolating it raw would let a stray `<` break the layout and would put an
 * injection hole in a message going to every account on the platform, so it is
 * escaped and only then given paragraph breaks.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphs(s: string): string {
  return escapeHtml(s)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}
