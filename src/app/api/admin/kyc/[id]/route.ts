import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { deliverToUser } from "@/lib/notify";
import { z } from "zod";
import { checkDocumentNumber } from "@/lib/kyc/document-number";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject", "request_more"]),
  rejectionReason: z.string().optional(),
  decisionNote: z.string().optional(),
  // The reviewer can set or correct the ID number against the image — OCR
  // mis-reads a digit often enough, and a wrong number would let the same
  // document verify twice. Falls back to whatever the submission carried.
  documentNumber: z.string().max(60).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/kyc/[id] - Approve / reject a KYC document
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validation = reviewSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }
    const { action, rejectionReason, decisionNote, documentNumber } =
      validation.data;

    if (action === "approve" && !(await can(session.user.id, "kyc.approve"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (action !== "approve" && !(await can(session.user.id, "kyc.reject"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (action === "reject" && !rejectionReason?.trim()) {
      return NextResponse.json(
        { error: "Rejection reason is required" },
        { status: 400 }
      );
    }

    const doc = await prisma.kYCDocument.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (doc.status !== "PENDING") {
      return NextResponse.json(
        { error: "Document has already been reviewed" },
        { status: 400 }
      );
    }

    if (action === "approve") {
      // Approval is where the number is CLAIMED — only a verified document
      // should own it. Re-checked here and not just at submission, because the
      // queue can sit for days and another account may have been verified on
      // the same ID in between. `User.nidNumber` is unique, so a race that beats
      // this check still cannot produce two verified accounts.
      const check = await checkDocumentNumber(
        doc.userId,
        documentNumber ?? doc.documentNumber,
        { required: false }
      );
      if (!check.ok) {
        return NextResponse.json(
          { error: check.message, reason: check.reason },
          { status: check.reason === "DUPLICATE" ? 409 : 400 }
        );
      }

      await prisma.$transaction([
        prisma.kYCDocument.update({
          where: { id },
          data: {
            status: "APPROVED",
            reviewedBy: session.user.id,
            reviewedAt: new Date(),
            rejectionReason: null,
            ...(check.normalized ? { documentNumber: check.normalized } : {}),
          },
        }),
        prisma.user.update({
          where: { id: doc.userId },
          data: {
            kycStatus: "APPROVED",
            kycApprovedAt: new Date(),
            // Claimed on approval — this is what the unique index guards, and
            // it is why the manual path is no longer a way around the check.
            ...(check.normalized ? { nidNumber: check.normalized } : {}),
          },
        }),
        prisma.notification.create({
          data: {
            userId: doc.userId,
            type: "SYSTEM",
            title: "KYC verified ✅",
            message:
              "Your identity has been verified. You now have full access to withdrawals and the blue badge." +
              (decisionNote ? `\n\n${decisionNote}` : ""),
          },
        }),
      ]);

      await writeAudit({
        actorId: session.user.id,
        action: "KYC_APPROVED",
        entity: "KYCDocument",
        entityId: id,
        targetUserId: doc.userId,
        summary: `Approved KYC${decisionNote ? ` — ${decisionNote}` : ""}`,
        meta: { decisionNote: decisionNote ?? null },
      });

      void deliverToUser({
        userId: doc.userId,
        title: "KYC verified ✅",
        message: "Your identity has been verified — full withdrawal access unlocked.",
        link: "/profile",
      });

      return NextResponse.json({ success: true, message: "KYC approved" });
    } else if (action === "reject") {
      await prisma.$transaction([
        prisma.kYCDocument.update({
          where: { id },
          data: {
            status: "REJECTED",
            reviewedBy: session.user.id,
            reviewedAt: new Date(),
            rejectionReason: rejectionReason!,
          },
        }),
        prisma.user.update({
          where: { id: doc.userId },
          data: { kycStatus: "REJECTED" },
        }),
        prisma.notification.create({
          data: {
            userId: doc.userId,
            type: "SYSTEM",
            title: "KYC rejected",
            message: `Your verification was rejected. Reason: ${rejectionReason}${
              decisionNote ? `\n\n${decisionNote}` : ""
            }\n\nYou can resubmit at any time.`,
          },
        }),
      ]);

      await writeAudit({
        actorId: session.user.id,
        action: "KYC_REJECTED",
        entity: "KYCDocument",
        entityId: id,
        targetUserId: doc.userId,
        summary: `Rejected KYC — ${rejectionReason}`,
        meta: { rejectionReason, decisionNote: decisionNote ?? null },
      });

      void deliverToUser({
        userId: doc.userId,
        title: "KYC rejected",
        message: `Your verification was rejected. Reason: ${rejectionReason}. You can resubmit anytime.`,
        link: "/profile",
      });

      return NextResponse.json({ success: true, message: "KYC rejected" });
    } else {
      // request_more — keep PENDING but notify user
      await prisma.notification.create({
        data: {
          userId: doc.userId,
          type: "SYSTEM",
          title: "Additional documents requested",
          message:
            decisionNote ||
            "Please submit additional documents for KYC verification.",
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "KYC_MORE_INFO_REQUESTED",
          entity: "KYCDocument",
          entityId: id,
          newData: { decisionNote: decisionNote ?? null },
        },
      });

      return NextResponse.json({
        success: true,
        message: "Request for more info sent to user",
      });
    }
  } catch (error) {
    console.error("Error reviewing KYC:", error);
    return NextResponse.json(
      { error: "Failed to review KYC document" },
      { status: 500 }
    );
  }
}
