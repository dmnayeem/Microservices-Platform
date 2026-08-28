import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { groupsDisabled } from "@/lib/groups-gate";
import { prisma } from "@/lib/prisma";
import { GroupRole, GroupType } from "@/generated/prisma/client";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
  const { id } = await params;

  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Already a member" }, { status: 400 });
  }

  if (group.type === GroupType.PUBLIC) {
    await prisma.$transaction([
      prisma.groupMember.create({
        data: { groupId: id, userId, role: GroupRole.MEMBER },
      }),
      prisma.group.update({
        where: { id },
        data: { memberCount: { increment: 1 } },
      }),
    ]);
    return NextResponse.json({ success: true, status: "joined" });
  }

  // PRIVATE → request flow
  const existingReq = await prisma.groupJoinRequest.findUnique({
    where: { groupId_userId: { groupId: id, userId } },
  });
  if (existingReq && existingReq.status === "PENDING") {
    return NextResponse.json({ error: "Request already pending" }, { status: 400 });
  }
  if (existingReq) {
    await prisma.groupJoinRequest.update({
      where: { id: existingReq.id },
      data: { status: "PENDING", createdAt: new Date(), decidedAt: null },
    });
  } else {
    await prisma.groupJoinRequest.create({
      data: { groupId: id, userId, status: "PENDING" },
    });
  }
  return NextResponse.json({ success: true, status: "requested" });
}
