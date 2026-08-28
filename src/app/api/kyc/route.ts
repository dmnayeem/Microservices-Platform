import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { parseDocumentImages } from "@/lib/kyc";
import { checkDocumentNumber } from "@/lib/kyc/document-number";

/**
 * User-facing KYC intake. `POST` submits identity documents (1–3 image URLs +
 * a document type) and moves the user to PENDING review; `GET` returns the
 * current status and the latest submission. Admin approve/reject lives in
 * /api/admin/kyc/[id] and reads the same KYCDocument rows, so nothing there
 * changes. Multiple images are stored as a JSON array in `documentUrl` (only the
 * admin queue renders that field); a single image stays a plain URL for
 * backward compatibility.
 */
const submitSchema = z.object({
  documentType: z.string().min(2).max(60),
  images: z.array(z.string().url()).min(1).max(3),
  // Required. Without it this route was the bypass: the OCR path could at least
  // read a number off the image, while a manual submission carried none at all,
  // so anyone choosing "manual" could verify the same ID on unlimited accounts.
  documentNumber: z.string().min(4).max(60),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [user, doc] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { kycStatus: true } }),
    prisma.kYCDocument.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    kycStatus: user?.kycStatus ?? "NOT_SUBMITTED",
    document: doc
      ? {
          id: doc.id,
          documentType: doc.documentType,
          images: parseDocumentImages(doc.documentUrl),
          status: doc.status,
          rejectionReason: doc.rejectionReason,
          createdAt: doc.createdAt.toISOString(),
          reviewedAt: doc.reviewedAt?.toISOString() ?? null,
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => ({}));
  const v = submitSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid submission" },
      { status: 400 }
    );
  }
  const { documentType, images, documentNumber } = v.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycStatus: true },
  });
  if (user?.kycStatus === "PENDING") {
    return NextResponse.json(
      { error: "You already have a KYC submission under review." },
      { status: 400 }
    );
  }
  if (user?.kycStatus === "APPROVED") {
    return NextResponse.json(
      { error: "Your identity is already verified." },
      { status: 400 }
    );
  }

  // One ID, one account — checked before anything is stored. `User.nidNumber`
  // is also unique, so this is the friendly error rather than the enforcement.
  const check = await checkDocumentNumber(userId, documentNumber, {
    required: true,
  });
  if (!check.ok) {
    return NextResponse.json(
      { error: check.message, reason: check.reason },
      { status: check.reason === "DUPLICATE" ? 409 : 400 }
    );
  }

  const documentUrl = images.length === 1 ? images[0] : JSON.stringify(images);

  const doc = await prisma.$transaction(async (tx) => {
    const created = await tx.kYCDocument.create({
      data: {
        userId,
        documentType,
        documentUrl,
        documentNumber: check.normalized,
        status: "PENDING",
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { kycStatus: "PENDING" },
    });
    return created;
  });

  return NextResponse.json({ success: true, status: "PENDING", id: doc.id });
}
