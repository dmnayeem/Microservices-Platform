import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "kyc.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const appeals = await prisma.kYCAppeal.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  // Hydrate user info
  const userIds = [...new Set(appeals.map((a) => a.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, avatar: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  // Hydrate document info
  const docIds = [...new Set(appeals.map((a) => a.kycDocumentId))];
  const docs = docIds.length
    ? await prisma.kYCDocument.findMany({
        where: { id: { in: docIds } },
        select: {
          id: true,
          documentType: true,
          documentUrl: true,
          rejectionReason: true,
          status: true,
        },
      })
    : [];
  const docById = new Map(docs.map((d) => [d.id, d]));

  return NextResponse.json({
    appeals: appeals.map((a) => ({
      id: a.id,
      userId: a.userId,
      user: userById.get(a.userId) ?? null,
      kycDocumentId: a.kycDocumentId,
      kycDocument: docById.get(a.kycDocumentId) ?? null,
      reason: a.reason,
      evidence: a.evidence,
      status: a.status,
      adminNote: a.adminNote,
      reviewedById: a.reviewedById,
      reviewedAt: a.reviewedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}
