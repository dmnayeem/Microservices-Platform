import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { deletePostCascade } from "@/lib/content-delete";

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

  // Every relation pointing at Post declares `onDelete: Cascade`, so one delete
  // is enough. This used to be a seven-statement cleanup transaction whose own
  // comment claimed "cascades aren't set on every relation" — they are, and the
  // list was both redundant and incomplete (it omitted PostBoostView and
  // PostLinkClick, which cascade too). See src/lib/content-delete.ts for what
  // the database genuinely does not handle.
  const outcome = await deletePostCascade(id);
  if (!outcome.ok) {
    return NextResponse.json(
      { error: "Failed to delete the post" },
      { status: outcome.reason === "not_found" ? 404 : 500 }
    );
  }

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
