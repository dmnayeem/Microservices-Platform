import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "EarnGPT";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
// Tolerate the env-name variants for the From address (SMTP_FROM is canonical;
// EMAIL_FROM is what some deployments set) and fall back to the SMTP user so
// the header is never `<undefined>`.
const FROM_ADDRESS =
  process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER || "";

export async function sendVerificationEmail(
  email: string,
  token: string,
  name: string
) {
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

  await transporter.sendMail({
    from: `${APP_NAME} <${FROM_ADDRESS}>`,
    to: email,
    subject: `Verify your ${APP_NAME} account`,
    html,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  name: string
) {
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

  await transporter.sendMail({
    from: `${APP_NAME} <${FROM_ADDRESS}>`,
    to: email,
    subject: `Reset your ${APP_NAME} password`,
    html,
  });
}

export async function sendWelcomeEmail(email: string, name: string) {
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

  await transporter.sendMail({
    from: `${APP_NAME} <${FROM_ADDRESS}>`,
    to: email,
    subject: `Welcome to ${APP_NAME}! Let's start earning`,
    html,
  });
}

/** True when SMTP is configured (env). Used to skip email sends gracefully. */
export function isSmtpConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  );
}

/**
 * Generic transactional notification email (title + message) with the app's
 * dark branded template. Best-effort — callers should catch/ignore errors.
 */
export async function sendNotificationEmail(
  email: string,
  title: string,
  message: string,
  link?: string
) {
  if (!isSmtpConfigured()) return;
  const currentYear = new Date().getFullYear();
  const cta = link
    ? `<div style="text-align:center;margin:28px 0;">
         <a href="${link.startsWith("http") ? link : `${APP_URL}${link}`}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;">View</a>
       </div>`
    : "";
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,sans-serif;background-color:#0a0a0f;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 20px;">
        <tr><td>
          <div style="background:linear-gradient(145deg,#14141f,#1a1a25);border-radius:16px;padding:36px;border:1px solid #2a2a3a;">
            <h1 style="color:#fff;font-size:22px;margin:0 0 12px 0;">${title}</h1>
            <p style="color:#a0a0b0;font-size:15px;line-height:1.6;margin:0;">${message}</p>
            ${cta}
          </div>
          <p style="color:#6a6a7a;font-size:12px;text-align:center;margin:20px 0 0 0;">&copy; ${currentYear} ${APP_NAME}. All rights reserved.</p>
        </td></tr>
      </table>
    </body></html>`;
  await transporter.sendMail({
    from: `${APP_NAME} <${FROM_ADDRESS}>`,
    to: email,
    subject: `${title} · ${APP_NAME}`,
    html,
  });
}
