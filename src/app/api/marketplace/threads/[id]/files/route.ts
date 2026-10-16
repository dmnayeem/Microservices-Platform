import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDownloadUrl } from "@/lib/s3";
import { resolveThreadAccess } from "@/lib/marketplace-thread";
import { DELIVERY_SENDER_TYPE } from "@/lib/service-packages";
import type { UserRole } from "@/generated/prisma";

// GET /api/marketplace/threads/:id/files?m=<messageId>&n=<index>
//
// Opens a file attached to a delivery in this thread. Delivered files are
// uploaded to the PRIVATE `marketplace/` prefix, so only the buyer, the seller
// and a mediating admin get a short-lived signed URL; links to other sites are
// redirected to as-is.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { thread, role } = await resolveThreadAccess(
    id,
    session.user.id,
    session.user.role as UserRole | undefined
  );
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messageId = request.nextUrl.searchParams.get("m") ?? "";
  const idx = Number(request.nextUrl.searchParams.get("n") ?? "0");
  const msg = await prisma.marketplaceThreadMessage.findFirst({
    where: { id: messageId, threadId: id, senderType: DELIVERY_SENDER_TYPE },
    select: { senderId: true, attachments: true },
  });
  const fileUrl = Number.isInteger(idx) && idx >= 0 ? msg?.attachments[idx] : undefined;
  if (!msg || !fileUrl) return NextResponse.json({ error: "No file" }, { status: 404 });

  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return NextResponse.json({ error: "No file" }, { status: 404 });
  }
  const host = parsed.hostname.toLowerCase();
  const ours =
    host.endsWith(".amazonaws.com") ||
    (!!process.env.AWS_CLOUDFRONT_DOMAIN && host === process.env.AWS_CLOUDFRONT_DOMAIN.toLowerCase());
  if (!ours) {
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return NextResponse.json({ error: "No file" }, { status: 404 });
    }
    return NextResponse.redirect(parsed.toString(), { status: 302 });
  }

  // Only sign what the sender uploaded themselves (keys are
  // `marketplace/<uploaderId>/…`). Otherwise a seller could paste the URL of
  // someone else's private deliverable and have this route sign it.
  const key = decodeURIComponent(parsed.pathname.slice(1));
  if (!key.startsWith(`marketplace/${msg.senderId}/`) || key.includes("..")) {
    return NextResponse.json({ error: "File not available" }, { status: 403 });
  }
  const signed = await getDownloadUrl(key, 900);
  if (!signed.success || !signed.downloadUrl) {
    return NextResponse.json({ error: "File not available" }, { status: 503 });
  }
  return NextResponse.redirect(signed.downloadUrl, { status: 302 });
}
