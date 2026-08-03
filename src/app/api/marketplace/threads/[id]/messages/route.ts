import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { resolveThreadAccess } from "@/lib/marketplace-thread";
import { notifyUser } from "@/lib/notify";
import type { UserRole } from "@/generated/prisma";

const schema = z.object({
  body: z.string().min(1).max(2000),
  attachments: z.array(z.string().url()).max(6).optional(),
});

// POST /api/marketplace/threads/:id/messages — send a message in a thread.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const v = schema.safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const userId = session.user.id;
  const { thread, role } = await resolveThreadAccess(
    id,
    userId,
    session.user.role as UserRole | undefined
  );
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const senderType = role === "ADMIN" ? "ADMIN" : "USER";

  // Bump unread for the recipient(s). An admin message alerts both parties.
  const unreadBump =
    role === "BUYER"
      ? { unreadSeller: { increment: 1 } }
      : role === "SELLER"
      ? { unreadBuyer: { increment: 1 } }
      : { unreadBuyer: { increment: 1 }, unreadSeller: { increment: 1 } };

  const [message] = await prisma.$transaction([
    prisma.marketplaceThreadMessage.create({
      data: {
        threadId: id,
        senderId: userId,
        senderType,
        body: v.data.body.trim(),
        attachments: v.data.attachments ?? [],
      },
    }),
    prisma.marketplaceThread.update({
      where: { id },
      data: { lastMessageAt: new Date(), ...unreadBump },
    }),
  ]);

  // Notify the recipient(s) — best-effort.
  const recipients =
    role === "BUYER"
      ? [thread.sellerId]
      : role === "SELLER"
      ? [thread.buyerId]
      : [thread.buyerId, thread.sellerId];
  for (const r of recipients) {
    notifyUser({
      userId: r,
      type: "MESSAGE",
      title: role === "ADMIN" ? "Admin message" : "New message",
      message: v.data.body.slice(0, 120),
      link: `/marketplace/messages/${id}`,
    }).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    message: {
      id: message.id,
      senderId: message.senderId,
      senderType: message.senderType,
      body: message.body,
      attachments: message.attachments,
      createdAt: message.createdAt.toISOString(),
    },
  });
}
