import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { deliverToUser } from "@/lib/notify";
import {
  approveCreatorApplication,
  rejectCreatorApplication,
  CREATOR_TYPES,
} from "@/lib/creator-application";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  adminNote: z.string().max(2000).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "creators.review"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { action, adminNote } = parsed.data;

  try {
    const app =
      action === "approve"
        ? await approveCreatorApplication({
            applicationId: id,
            reviewerId: session.user.id,
            adminNote: adminNote ?? null,
          })
        : await rejectCreatorApplication({
            applicationId: id,
            reviewerId: session.user.id,
            adminNote: adminNote ?? null,
          });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: action === "approve" ? "CREATOR_APP_APPROVE" : "CREATOR_APP_REJECT",
        entity: "CreatorApplication",
        entityId: id,
        newData: { type: app.type, adminNote: adminNote ?? null },
      },
    });

    const meta = CREATOR_TYPES[app.type];
    void deliverToUser({
      userId: app.userId,
      title:
        action === "approve"
          ? `Approved: ${meta.label}`
          : `${meta.label} application update`,
      message:
        action === "approve"
          ? `You now have ${meta.label} access.`
          : "Your application wasn't approved this time.",
      link: action === "approve" ? meta.dashboardHref : "/profile/become-creator",
    });

    return NextResponse.json({ success: true, application: { id: app.id, status: app.status } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 }
    );
  }
}
