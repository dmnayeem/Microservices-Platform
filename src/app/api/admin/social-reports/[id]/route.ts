import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  resolution: z.enum(["DISMISSED", "WARNED", "SUSPENDED", "BANNED", "DELETED"]),
  resolverNote: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "social.moderate"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const { resolution, resolverNote } = v.data;

  const report = await prisma.socialReport.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  await prisma.socialReport.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolution,
      resolverNote: resolverNote ?? null,
      resolvedById: session.user.id,
      resolvedAt: new Date(),
    },
  });

  // For BANNED/SUSPENDED resolutions on USER content type, also update the user
  if (
    report.contentType === "USER" &&
    (resolution === "BANNED" || resolution === "SUSPENDED")
  ) {
    await prisma.user.update({
      where: { id: report.contentId },
      data: { status: resolution === "BANNED" ? "BANNED" : "SUSPENDED" },
    });
  }

  // For DELETED on POST/COMMENT — soft delete
  if (resolution === "DELETED") {
    if (report.contentType === "POST") {
      await prisma.post.delete({ where: { id: report.contentId } }).catch(() => {});
    } else if (report.contentType === "COMMENT") {
      await prisma.comment
        .delete({ where: { id: report.contentId } })
        .catch(() => {});
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: `MODERATION_${resolution}`,
      entity: "SocialReport",
      entityId: id,
      newData: {
        contentType: report.contentType,
        contentId: report.contentId,
        resolverNote: resolverNote ?? null,
      },
    },
  });

  return NextResponse.json({ success: true });
}
