import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { writeAudit } from "@/lib/audit";

/**
 * One-click unsubscribe (RFC 8058).
 *
 * Gmail and Yahoo POST `List-Unsubscribe=One-Click` to the URL in the
 * `List-Unsubscribe` header, with no cookies and from their own servers — so
 * this route is public (middleware allowlist) and the signed token in the query
 * is the only authority. The /unsubscribe page's confirm button posts here too.
 *
 * GET never changes anything: link scanners and mail-client prefetchers open
 * every URL in a message, and a GET that unsubscribed would switch people off
 * without them ever clicking. GET just sends the reader to the confirm page.
 *
 * What it sets is `User.emailNotifications = false` — marketing/broadcast
 * email only. Service notices and transactional mail ignore it.
 */
export const runtime = "nodejs";

// Behind the reverse proxy `request.url` can carry the internal host, so the
// redirects are built on the public origin.
const origin = (request: NextRequest) =>
  (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/+$/, "");

async function tokenFrom(request: NextRequest): Promise<string | null> {
  const q = request.nextUrl.searchParams.get("t");
  if (q) return q;
  try {
    const form = await request.formData();
    const t = form.get("t");
    return typeof t === "string" ? t : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const token = await tokenFrom(request);
  const userId = verifyUnsubscribeToken(token);
  const fromPage = request.nextUrl.searchParams.get("from") === "page";
  if (!userId) {
    return fromPage
      ? NextResponse.redirect(`${origin(request)}/unsubscribe?error=1`, 303)
      : NextResponse.json({ error: "Invalid unsubscribe link" }, { status: 400 });
  }

  const res = await prisma.user.updateMany({
    where: { id: userId, emailNotifications: true },
    data: { emailNotifications: false },
  });
  if (res.count > 0) {
    await writeAudit({
      actorId: userId,
      action: "EMAIL_UNSUBSCRIBED",
      entity: "User",
      entityId: userId,
      targetUserId: userId,
      summary: fromPage ? "Unsubscribed from email updates (confirm page)" : "Unsubscribed from email updates (one-click)",
    }).catch(() => {});
  }

  return fromPage
    ? NextResponse.redirect(`${origin(request)}/unsubscribe?t=${encodeURIComponent(token ?? "")}&done=1`, 303)
    : new NextResponse("Unsubscribed", { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t") ?? "";
  return NextResponse.redirect(`${origin(request)}/unsubscribe?t=${encodeURIComponent(t)}`, 303);
}
