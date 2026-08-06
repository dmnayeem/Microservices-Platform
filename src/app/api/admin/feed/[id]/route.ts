import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/admin/feed/[id]
 *
 * Admin force-delete any post regardless of authorship. Cascades through
 * the relations defined on Post (likes, comments, votes, views, shares,
 * mentions, donations).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !(await can(session.user.id, "social.moderate")) &&
    !(await can(session.user.id, "social.post"))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Prisma cascades aren't set on every relation — clear children first
  // to avoid FK errors. Mirrors the cleanup the social-reports DELETE
  // resolution performs.
  await prisma.$transaction([
    prisma.like.deleteMany({ where: { postId: id } }),
    prisma.comment.deleteMany({ where: { postId: id } }),
    prisma.vote.deleteMany({ where: { postId: id } }),
    prisma.postView.deleteMany({ where: { postId: id } }),
    prisma.postShare.deleteMany({ where: { postId: id } }),
    prisma.mention.deleteMany({ where: { postId: id } }),
    prisma.donation.deleteMany({ where: { postId: id } }),
    prisma.post.delete({ where: { id } }),
  ]);

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "POST_FORCE_DELETED",
      entity: "Post",
      entityId: id,
      newData: { authorId: post.userId },
    },
  });

  return NextResponse.json({ ok: true });
}
