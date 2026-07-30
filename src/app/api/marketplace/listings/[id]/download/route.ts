import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDownloadUrl } from "@/lib/s3";
import { hasPermission, type UserRole } from "@/lib/rbac";

/**
 * Purchase-gated deliverable download. Only the buyer (with a completed
 * purchase), the seller, or an admin may fetch the sellable file — and only via
 * a short-lived signed URL (our-hosted files) so the permanent URL is never
 * exposed. Redirects to the signed URL so a plain link downloads.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const idx = parseInt(new URL(request.url).searchParams.get("f") ?? "0", 10) || 0;

  const listing = await prisma.marketplaceListing.findUnique({
    where: { id },
    select: { sellerId: true, files: true },
  });
  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = session.user.role as UserRole | undefined;
  let allowed =
    listing.sellerId === session.user.id ||
    hasPermission(role, "marketplace.manage");
  if (!allowed) {
    const purchase = await prisma.marketplacePurchase.findFirst({
      where: { listingId: id, buyerId: session.user.id, status: "COMPLETED" },
      select: { id: true },
    });
    allowed = !!purchase;
  }
  if (!allowed) {
    return NextResponse.json({ error: "Purchase required" }, { status: 403 });
  }

  const fileUrl = listing.files?.[idx];
  if (!fileUrl) {
    return NextResponse.json({ error: "No file" }, { status: 404 });
  }

  // Sign our-hosted files; redirect straight to external ones.
  let target = fileUrl;
  try {
    const host = new URL(fileUrl).hostname.toLowerCase();
    const ours =
      host.endsWith(".amazonaws.com") ||
      (!!process.env.AWS_CLOUDFRONT_DOMAIN &&
        host === process.env.AWS_CLOUDFRONT_DOMAIN.toLowerCase());
    if (ours) {
      const key = new URL(fileUrl).pathname.slice(1);
      const signed = await getDownloadUrl(key, 900);
      if (signed.success && signed.downloadUrl) target = signed.downloadUrl;
    }
  } catch {
    /* malformed → fall back to stored value */
  }

  return NextResponse.redirect(target, { status: 302 });
}
