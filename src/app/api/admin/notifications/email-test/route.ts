import { testRecipient } from "@/lib/mailer";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail, isSmtpConfigured } from "@/lib/email";
import { prepareBroadcastEmail } from "@/lib/broadcast-email";
import { decodeEmailBody } from "@/lib/email-html";
import { unsubscribeUrls } from "@/lib/unsubscribe";

/**
 * "Send test to me" from the broadcast composer.
 *
 * Goes through the same `sendNotificationEmail` → `sendMail` path a broadcast
 * recipient's copy does, but to the signed-in admin's own address only, and
 * writes no Broadcast / BroadcastRecipient row — so it is not a broadcast, not
 * counted against the daily cap, and cannot reach anybody else.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "notifications.send"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } });
  const to = await testRecipient(me?.email);
  if (!to) return NextResponse.json({ error: "Your account has no email address" }, { status: 400 });
  if (!(await isSmtpConfigured())) {
    return NextResponse.json({ error: "SMTP is not configured — set it up in Settings → Email" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const title = s("emailSubject") || s("title");
  if (!title) return NextResponse.json({ error: "Write a title or subject first" }, { status: 400 });

  const prepared = await prepareBroadcastEmail(
    { emailBody: s("emailBody"), emailHtml: s("emailHtml"), emailPreheader: s("emailPreheader"), actionUrl: s("actionUrl") },
    { userId: session.user.id }
  );
  if ("error" in prepared) return NextResponse.json({ error: prepared.error }, { status: 400 });
  const stored = decodeEmailBody(prepared.emailBody);
  const site = (process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com").replace(/\/+$/, "");

  try {
    await sendNotificationEmail(
      to,
      `[Test] ${title}`,
      stored.format === "text" ? stored.body || s("message") : s("message"),
      s("actionUrl") || undefined,
      {
        // Transactional so the test arrives even while marketing email is
        // switched off — the admin is checking the design, not the switch.
        transactional: true,
        style: s("style") || undefined,
        kicker: s("kicker") || undefined,
        imageUrl: s("imageUrl") || undefined,
        actionLabel: s("actionLabel") || undefined,
        html: stored.format === "html" ? stored.body : undefined,
        preheader: stored.preheader || undefined,
        unsubscribe: body.important === true ? null : unsubscribeUrls(site, session.user.id),
      }
    );
  } catch (e) {
    return NextResponse.json(
      { error: `The test email could not be sent: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true, message: `Test sent to ${to}` });
}
