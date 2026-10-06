import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Super-admin page visibility: refuse when /chat is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/chat");
  if (pageHidden) return pageHidden;
  const userId = session.user.id;

  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ user1Id: userId }, { user2Id: userId }],
    },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
  });

  // Fetch other-user data + last message for each
  const otherUserIds = conversations.map((c) =>
    c.user1Id === userId ? c.user2Id : c.user1Id
  );
  const users = await prisma.user.findMany({
    where: { id: { in: otherUserIds } },
    select: { id: true, name: true, avatar: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Exactly one row per conversation: a LATERAL "latest message" lookup on
  // the (conversationId, createdAt) index. Prisma's `distinct` is applied in
  // memory AFTER fetching, so the old query pulled every message of all 50
  // conversations on each inbox load.
  const convIds = conversations.map((c) => c.id);
  const lastMessages =
    convIds.length === 0
      ? []
      : await prisma.$queryRaw<
          Array<{ conversationId: string; content: string; createdAt: Date }>
        >`
          SELECT c.id AS "conversationId", m.content, m."createdAt"
          FROM unnest(${convIds}::text[]) AS c(id)
          CROSS JOIN LATERAL (
            SELECT "content", "createdAt"
            FROM "ChatMessage"
            WHERE "conversationId" = c.id
            ORDER BY "createdAt" DESC
            LIMIT 1
          ) m`;
  const lastMsgMap = new Map(lastMessages.map((m) => [m.conversationId, m]));

  const result = conversations.map((c) => {
    const otherId = c.user1Id === userId ? c.user2Id : c.user1Id;
    const isUser1 = c.user1Id === userId;
    const other = userMap.get(otherId);
    const last = lastMsgMap.get(c.id);
    return {
      id: c.id,
      otherUser: {
        id: otherId,
        name: other?.name ?? null,
        avatar: other?.avatar ?? null,
      },
      lastMessage: last
        ? { content: last.content, createdAt: new Date(last.createdAt).toISOString() }
        : undefined,
      unread: isUser1 ? c.unreadByUser1 : c.unreadByUser2,
    };
  });

  return NextResponse.json({ conversations: result });
}

const createSchema = z.object({
  withUserId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Super-admin page visibility: refuse when /chat is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/chat");
  if (pageHidden) return pageHidden;
  const body = await request.json();
  const v = createSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const userId = session.user.id;
  const otherId = v.data.withUserId;
  if (otherId === userId) {
    return NextResponse.json(
      { error: "Cannot start conversation with yourself" },
      { status: 400 }
    );
  }

  const otherUser = await prisma.user.findUnique({ where: { id: otherId } });
  if (!otherUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Sort IDs lexicographically so user1Id < user2Id (avoids duplicate conversations)
  const [user1Id, user2Id] = [userId, otherId].sort();

  const conversation = await prisma.conversation.upsert({
    where: { user1Id_user2Id: { user1Id, user2Id } },
    create: { user1Id, user2Id },
    update: {},
  });

  return NextResponse.json({ id: conversation.id });
}
