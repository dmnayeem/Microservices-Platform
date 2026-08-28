import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";

/**
 * Save / unsave a post.
 *
 * Private to the user: no counters move, nothing is credited, and the post's
 * author is not notified. That is deliberate — a bookmark that paid or notified
 * would be farmable, and this is the one post action with no earning attached.
 *
 * `@@unique([userId, postId])` makes both verbs idempotent, so a double-tap or a
 * retried request cannot create two rows.
 */

async function guard(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  // No points here, so this is only a write-storm guard, not an anti-farming one.
  const limited = await enforceDbRateLimit(
    request,
    "save-post",
    session.user.id,
    120,
    60_000
  );
  if (limited) return { error: limited };
  return { userId: session.user.id };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard(request);
  if (g.error) return g.error;
  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Idempotent: saving something already saved is a no-op, not an error.
  await prisma.savedPost.upsert({
    where: { userId_postId: { userId: g.userId!, postId: id } },
    create: { userId: g.userId!, postId: id },
    update: {},
  });

  return NextResponse.json({ saved: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard(request);
  if (g.error) return g.error;
  const { id } = await params;

  // deleteMany, not delete: unsaving something that was never saved should
  // report the end state, not a P2025.
  await prisma.savedPost.deleteMany({
    where: { userId: g.userId!, postId: id },
  });

  return NextResponse.json({ saved: false });
}
