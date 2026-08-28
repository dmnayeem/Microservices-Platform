import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { groupsDisabled } from "@/lib/groups-gate";
import { prisma } from "@/lib/prisma";
import { GroupRole } from "@/generated/prisma/client";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  // Feature switch — see src/lib/groups-gate.ts. Checked before auth so a
  // disabled feature answers the same way for everyone.
  const off = await groupsDisabled();
  if (off) return off;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id, reqId } = await params;

  const me = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId } },
  });
  if (!me || (me.role !== "OWNER" && me.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const request = await prisma.groupJoinRequest.findUnique({
    where: { id: reqId },
  });
  if (!request || request.groupId !== id) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (request.status !== "PENDING") {
    return NextResponse.json(
      { error: "Request is no longer pending" },
      { status: 400 }
    );
  }

  if (v.data.action === "approve") {
    await prisma.$transaction([
      prisma.groupMember.create({
        data: {
          groupId: id,
          userId: request.userId,
          role: GroupRole.MEMBER,
        },
      }),
      prisma.group.update({
        where: { id },
        data: { memberCount: { increment: 1 } },
      }),
      prisma.groupJoinRequest.update({
        where: { id: reqId },
        data: { status: "APPROVED", decidedAt: new Date() },
      }),
    ]);
    return NextResponse.json({ success: true, status: "approved" });
  }

  await prisma.groupJoinRequest.update({
    where: { id: reqId },
    data: { status: "REJECTED", decidedAt: new Date() },
  });
  return NextResponse.json({ success: true, status: "rejected" });
}
