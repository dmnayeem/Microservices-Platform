import { testRecipient } from "@/lib/mailer";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getMailConfig, buildTransport, buildMessage } from "@/lib/mailer";
import { getEmailBrand } from "@/lib/email";
import { renderEmail } from "@/lib/email-layout";
import { toEmailSafeHtml, escapeHtml } from "@/lib/email-html";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Test what the admin actually SAVED, not what the process booted with. This
  // route read env vars only, so an owner who configured SMTP on the settings
  // screen, saved it, and pressed "Send test email" was told it wasn't
  // configured — the one message guaranteed to make them think it was broken.
  const cfg = await getMailConfig();
  const { host, port } = cfg;

  if (!cfg.configured) {
    return NextResponse.json(
      {
        error: "SMTP not configured",
        details:
          "Fill in SMTP Host, Username and Password on the Email tab and press Save (or set SMTP_HOST / SMTP_USER / SMTP_PASSWORD), then retry.",
      },
      { status: 400 }
    );
  }

  const to = await testRecipient(session.user.email);
  if (!to) {
    return NextResponse.json(
      { error: "Admin account has no email" },
      { status: 400 }
    );
  }

  try {
    // Through the real layout and `buildMessage` headers (Message-ID on our
    // domain, Reply-To, text part), so the test shows what users will get.
    const brand = await getEmailBrand();
    const sentAt = new Date().toLocaleString();
    const { html, text } = renderEmail(brand, {
      preheader: "Your SMTP settings work.",
      style: "SUCCESS",
      title: "SMTP test email",
      bodyHtml: toEmailSafeHtml(
        `<p><strong>Success!</strong> Your SMTP configuration is working.</p>
         <table><tbody>
           <tr><th>From</th><td>${escapeHtml(cfg.from)}</td></tr>
           <tr><th>Reply-To</th><td>${escapeHtml(cfg.replyTo)}</td></tr>
           <tr><th>SMTP host</th><td>${escapeHtml(`${host}:${port}`)}</td></tr>
           <tr><th>Sent at</th><td>${escapeHtml(sentAt)}</td></tr>
         </tbody></table>`,
        { baseUrl: brand.siteUrl }
      ).html,
      footnote: "Sent from the Email tab of your admin settings.",
    });
    await buildTransport(cfg).sendMail(
      buildMessage(cfg, { to, subject: `[${brand.name}] SMTP test email`, html, text })
    );

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${to}`,
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
