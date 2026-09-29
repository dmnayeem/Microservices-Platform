import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  content: z.string().min(1).max(2000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Super-admin page visibility: refuse when /chat is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/chat");
  if (pageHidden) return pageHidden;
  const { id } = await params;
  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const userId = session.user.id;
  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (conv.user1Id !== userId && conv.user2Id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Increment unread for the OTHER user
  const isUser1Sender = conv.user1Id === userId;

  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId: id,
        senderId: userId,
        content: v.data.content.trim(),
      },
    }),
    prisma.conversation.update({
      where: { id },
      data: {
        lastMessageAt: new Date(),
        ...(isUser1Sender
          ? { unreadByUser2: { increment: 1 } }
          : { unreadByUser1: { increment: 1 } }),
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    message: {
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      createdAt: message.createdAt.toISOString(),
      read: false,
    },
  });
}
