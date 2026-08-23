import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { priorityForReason } from "@/lib/moderation";

const schema = z.object({
  targetType: z.enum(["POST", "COMMENT", "USER", "LISTING", "GROUP"]),
  targetId: z.string().min(1),
  reason: z.string().min(1).max(50),
  details: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Priority comes from the shared map. The old inline list checked for
  // `"fraud"`, but the reporting dialog submits `"scam"` for that option — so
  // scam and fraud reports were filed as routine, which is exactly backwards.
  const priority = priorityForReason(v.data.reason);

  await prisma.socialReport.create({
    data: {
      contentType: v.data.targetType,
      contentId: v.data.targetId,
      reporterId: session.user.id,
      reason: v.data.reason.toUpperCase(),
      details: v.data.details ?? null,
      priority,
      status: "PENDING",
    },
  });

  return NextResponse.json({ success: true });
}
