import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission, type UserRole } from "@/lib/rbac";
import nodemailer from "nodemailer";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.role as UserRole | undefined, "settings.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const fromEmail =
    process.env.SMTP_FROM_EMAIL ||
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    user;

  if (!host || !user || !pass) {
    return NextResponse.json(
      {
        error: "SMTP not configured",
        details:
          "Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD env vars, then retry.",
      },
      { status: 400 }
    );
  }

  if (!session.user.email) {
    return NextResponse.json(
      { error: "Admin account has no email" },
      { status: 400 }
    );
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
    });

    const appName = process.env.NEXT_PUBLIC_APP_NAME || "EarnGPT";
    const sentAt = new Date().toLocaleString();

    await transporter.sendMail({
      from: `"${appName}" <${fromEmail}>`,
      to: session.user.email,
      subject: `[${appName}] SMTP Test Email`,
      text: `This is a test email from your ${appName} admin panel.\n\nSent at: ${sentAt}\nSent by: ${session.user.email}\n\nIf you're seeing this, your SMTP settings are working correctly.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 24px; border-radius: 12px; color: white; margin-bottom: 24px;">
            <h1 style="margin: 0; font-size: 22px;">${appName}</h1>
            <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">SMTP Test Email</p>
          </div>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            <strong>Success!</strong> Your SMTP configuration is working correctly.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Sent at</td>
              <td style="padding: 8px 0; color: #111827; text-align: right;">${sentAt}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Sent to</td>
              <td style="padding: 8px 0; color: #111827; text-align: right;">${session.user.email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">SMTP Host</td>
              <td style="padding: 8px 0; color: #111827; text-align: right;">${host}:${port}</td>
            </tr>
          </table>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
            This is an automated test email triggered from your admin settings panel.
          </p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${session.user.email}`,
    });
  } catch (err) {
    console.error("Test email failed:", err);
    return NextResponse.json(
      {
        error: "Failed to send test email",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
