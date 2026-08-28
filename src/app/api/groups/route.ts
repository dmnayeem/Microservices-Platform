import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { groupsDisabled } from "@/lib/groups-gate";
import { prisma } from "@/lib/prisma";
import { GroupType, GroupRole } from "@/generated/prisma/client";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
  avatarUrl: z.string().url().optional().nullable(),
});

export async function GET(request: NextRequest) {
  // Feature switch — see src/lib/groups-gate.ts. Checked before auth so a
  // disabled feature answers the same way for everyone.
  const off = await groupsDisabled();
  if (off) return off;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") || "all"; // all | mine | discover

  if (scope === "mine") {
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: { group: true },
      orderBy: { joinedAt: "desc" },
    });
    type WithGroup = (typeof memberships)[number] & {
      group: {
        id: string;
        name: string;
        description: string | null;
        type: GroupType;
        avatarUrl: string | null;
        memberCount: number;
        ownerId: string;
      };
    };
    const enriched = memberships as WithGroup[];
    return NextResponse.json({
      groups: enriched.map((m) => ({
        id: m.group.id,
        name: m.group.name,
        description: m.group.description,
        type: m.group.type,
        avatarUrl: m.group.avatarUrl,
        memberCount: m.group.memberCount,
        role: m.role,
        isOwner: m.group.ownerId === userId,
      })),
    });
  }

  // Discover: all PUBLIC groups not joined
  const myMemberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const joinedIds = new Set(myMemberships.map((m) => m.groupId));

  const groups = await prisma.group.findMany({
    where: {
      type: GroupType.PUBLIC,
      id: { notIn: Array.from(joinedIds) },
    },
    orderBy: [{ memberCount: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  // Pending requests by current user for these groups
  const requests = await prisma.groupJoinRequest.findMany({
    where: {
      userId,
      groupId: { in: groups.map((g) => g.id) },
      status: "PENDING",
    },
    select: { groupId: true },
  });
  const pendingSet = new Set(requests.map((r) => r.groupId));

  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      type: g.type,
      avatarUrl: g.avatarUrl,
      memberCount: g.memberCount,
      hasPendingRequest: pendingSet.has(g.id),
    })),
  });
}

export async function POST(request: NextRequest) {
  // Feature switch — see src/lib/groups-gate.ts. Checked before auth so a
  // disabled feature answers the same way for everyone.
  const off = await groupsDisabled();
  if (off) return off;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json();
  const v = createSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const group = await prisma.group.create({
    data: {
      ...v.data,
      ownerId: userId,
      memberCount: 1,
      members: {
        create: {
          userId,
          role: GroupRole.OWNER,
        },
      },
    },
  });

  return NextResponse.json({ group }, { status: 201 });
}
