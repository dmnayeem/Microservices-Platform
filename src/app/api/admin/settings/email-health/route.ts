import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getMailConfig } from "@/lib/mailer";
import { checkDomain } from "@/lib/email-dns";

/**
 * The Email settings tab's deliverability panel: the From header as it will
 * actually be sent (saved settings → env → platform name), and the From
 * domain's SPF / DKIM / DMARC / MX read from public DNS. Read-only.
 */
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "settings.view")) && !(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cfg = await getMailConfig();
  const dns = await checkDomain({ fromDomain: cfg.fromDomain, smtpHost: cfg.host });
  return NextResponse.json({
    from: cfg.from,
    fromName: cfg.fromName,
    fromAddress: cfg.fromAddress,
    replyTo: cfg.replyTo,
    smtpHost: cfg.host,
    configured: cfg.configured,
    enabled: cfg.enabled,
    ...dns,
  });
}
