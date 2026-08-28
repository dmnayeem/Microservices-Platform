import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { groupsDisabled } from "@/lib/groups-gate";
import { prisma } from "@/lib/prisma";

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
  if (group.ownerId === userId) {
    return NextResponse.json(
      { error: "Owner cannot leave the group. Transfer ownership or delete it." },
      { status: 400 }
    );
  }

  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId } },
  });
  if (!member) {
    return NextResponse.json({ error: "Not a member" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.groupMember.delete({ where: { id: member.id } }),
    prisma.group.update({
      where: { id },
      data: { memberCount: { decrement: 1 } },
    }),
  ]);

  return NextResponse.json({ success: true });
}
