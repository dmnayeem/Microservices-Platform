import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getSetting } from "@/lib/system-settings";
import { runAutoKyc } from "@/lib/kyc/auto-verify";
import { deliverToUser } from "@/lib/notify";

/**
 * Automated ("Persona-like") KYC. Runs Gemini OCR on the ID + AWS Rekognition
 * selfie↔ID face match, then either instantly APPROVES a high-confidence pass or
 * routes to the existing manual admin queue (PENDING). Never auto-rejects.
 */
const schema = z.object({
  documentType: z.string().min(2).max(60),
  idImages: z.array(z.string().url()).min(1).max(2),
  selfie: z.string().url(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  if (!(await getSetting<boolean>("kyc.autoEnabled", true))) {
    return NextResponse.json(
      { error: "Instant verification is currently unavailable. Please upload manually." },
      { status: 400 }
    );
  }

  const v = schema.safeParse(await request.json().catch(() => ({})));
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid submission" },
      { status: 400 }
    );
  }
  const { documentType, idImages, selfie } = v.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      kycStatus: true,
      name: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      nidNumber: true,
      bloodGroup: true,
    },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.kycStatus === "PENDING") {
    return NextResponse.json(
      { error: "You already have a KYC submission under review." },
      { status: 400 }
    );
  }
  if (user.kycStatus === "APPROVED") {
    return NextResponse.json(
      { error: "Your identity is already verified." },
      { status: 400 }
    );
  }

  // Light abuse guard: cap auto attempts per hour (each call costs AI + Rekognition).
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.kYCDocument.count({
    where: { userId, method: "AUTO", createdAt: { gte: hourAgo } },
  });
  if (recent >= 3) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later or upload manually." },
      { status: 429 }
    );
  }

  const result = await runAutoKyc({
    user: {
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth,
    },
    idImageUrls: idImages,
    selfieUrl: selfie,
  });

  const allImages = [...idImages, selfie];
  const documentUrl = JSON.stringify(allImages);
  const extracted = JSON.parse(
    JSON.stringify({ ...result.extracted, decision: result.decision, reasons: result.reasons })
  );

  // Clear non-ID (or floor-low confidence): don't pollute the manual queue —
  // surface an error so the user retries with a real ID. kycStatus is untouched
  // (stays NOT_SUBMITTED) so they can resubmit immediately.
  if (result.decision === "REJECT") {
    await prisma.auditLog.create({
      data: {
        userId,
        action: "KYC_AUTO_REJECTED",
        entity: "User",
        entityId: userId,
        newData: { reasons: result.reasons },
      },
    });
    return NextResponse.json(
      {
        status: "REJECTED",
        error:
          result.reasons[0] ??
          "The uploaded image doesn't look like a valid government ID.",
        reasons: result.reasons,
      },
      { status: 422 }
    );
  }

  if (result.decision === "APPROVED") {
    await prisma.$transaction(async (tx) => {
      await tx.kYCDocument.create({
        data: {
          userId,
          documentType,
          documentUrl,
          method: "AUTO",
          status: "APPROVED",
          extracted,
          reviewedAt: new Date(),
        },
      });
      // Backfill profile fields from the ID when empty.
      const patch: Record<string, unknown> = {
        kycStatus: "APPROVED",
        kycApprovedAt: new Date(),
      };
      if (!user.nidNumber && result.extracted.idNumber) patch.nidNumber = result.extracted.idNumber;
      if (!user.dateOfBirth && result.extracted.dateOfBirth) {
        const d = new Date(result.extracted.dateOfBirth);
        if (!Number.isNaN(d.getTime())) patch.dateOfBirth = d;
      }
      if (!user.bloodGroup && result.extracted.bloodGroup) {
        patch.bloodGroup = result.extracted.bloodGroup;
      }
      await tx.user.update({ where: { id: userId }, data: patch });
      await tx.notification.create({
        data: {
          userId,
          type: "SYSTEM",
          title: "KYC verified ✅",
          message:
            "Your identity was verified instantly. You now have full access to withdrawals and the blue badge.",
        },
      });
    });
    await prisma.auditLog.create({
      data: {
        userId,
        action: "KYC_AUTO_APPROVED",
        entity: "User",
        entityId: userId,
        newData: {
          faceSimilarity: result.extracted.faceSimilarity ?? null,
          ocrConfidence: result.extracted.ocrConfidence ?? null,
        },
      },
    });
    void deliverToUser({
      userId,
      title: "KYC verified ✅",
      message: "Your identity has been verified — full withdrawal access unlocked.",
      link: "/profile",
    });
    return NextResponse.json({ status: "APPROVED" });
  }

  // REVIEW → route to the manual admin queue.
  await prisma.$transaction(async (tx) => {
    await tx.kYCDocument.create({
      data: {
        userId,
        documentType,
        documentUrl,
        method: "AUTO",
        status: "PENDING",
        extracted,
      },
    });
    await tx.user.update({ where: { id: userId }, data: { kycStatus: "PENDING" } });
    await tx.notification.create({
      data: {
        userId,
        type: "SYSTEM",
        title: "KYC under review",
        message:
          "Thanks! We just need a quick manual check on your documents — you'll be notified shortly.",
      },
    });
  });
  await prisma.auditLog.create({
    data: {
      userId,
      action: "KYC_AUTO_REVIEW",
      entity: "User",
      entityId: userId,
      newData: { reasons: result.reasons },
    },
  });
  return NextResponse.json({ status: "PENDING", reasons: result.reasons });
}
