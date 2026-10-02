import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prepareBroadcastEmail, renderBroadcastEmail } from "@/lib/broadcast-email";

/**
 * Live preview for the broadcast composer: the email exactly as a recipient
 * gets it (same layout, same email-safe conversion, same footer), plus the
 * links the safety screen would flag. Renders only — nothing is sent or saved.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "notifications.send"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");

  const prepared = await prepareBroadcastEmail(
    { emailBody: s("emailBody"), emailHtml: s("emailHtml"), emailPreheader: s("emailPreheader"), actionUrl: s("actionUrl") },
    { userId: session.user.id }
  );
  const m = await renderBroadcastEmail(
    {
      title: s("title") || "Your title",
      message: s("message"),
      emailSubject: s("emailSubject"),
      emailBody: s("emailBody"),
      emailHtml: s("emailHtml"),
      emailPreheader: s("emailPreheader"),
      actionUrl: s("actionUrl"),
      actionLabel: s("actionLabel"),
      imageUrl: s("imageUrl"),
      style: s("style"),
      kicker: s("kicker"),
      important: body.important === true,
    },
    session.user.id
  );
  return NextResponse.json({
    subject: m.subject,
    html: m.html,
    text: m.text,
    unsubscribe: m.unsubscribe,
    error: "error" in prepared ? prepared.error : null,
    flaggedLinks: "error" in prepared ? [] : prepared.flaggedLinks,
    dropped: "error" in prepared ? [] : prepared.dropped,
  });
}
