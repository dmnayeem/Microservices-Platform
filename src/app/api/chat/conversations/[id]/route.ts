import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const userId = session.user.id;

  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (conv.user1Id !== userId && conv.user2Id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Incremental poll: `?since=<ISO>` returns ONLY messages newer than that
  // timestamp (and skips the other-user lookup). The 8s poll uses this so it
  // never re-pulls the whole thread — the key scale fix for many open chats.
  const sinceParam = request.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  const incremental = !!since && !isNaN(since.getTime());

  const messages = await prisma.chatMessage.findMany({
    where: {
      conversationId: id,
      ...(incremental ? { createdAt: { gt: since! } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: incremental ? 100 : 200,
  });

  const mapped = messages.map((m) => ({
    id: m.id,
    content: m.content,
    senderId: m.senderId,
    createdAt: m.createdAt.toISOString(),
    read: m.read,
  }));

  if (incremental) {
    return NextResponse.json({ messages: mapped, incremental: true });
  }

  const otherId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;
  const otherUser = await prisma.user.findUnique({
    where: { id: otherId },
    select: { id: true, name: true, avatar: true },
  });

  return NextResponse.json({
    otherUser: otherUser
      ? {
          id: otherUser.id,
          name: otherUser.name,
          avatar: otherUser.avatar,
          isOnline: false,
        }
      : null,
    messages: mapped,
  });
}
