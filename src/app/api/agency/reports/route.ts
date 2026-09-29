import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";

// GET /api/agency/reports — pending POST/COMMENT reports for an agency moderator,
// with the reported content resolved for preview.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Super-admin page visibility: refuse when /agency is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/agency");
  if (pageHidden) return pageHidden;
  if (!(await userCanFeature(session.user.id, "agencyMode"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reports = await prisma.socialReport.findMany({
    where: { status: "PENDING", contentType: { in: ["POST", "COMMENT"] } },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  // Resolve content previews (contentId is a loose string, not an FK).
  const postIds = reports.filter((r) => r.contentType === "POST").map((r) => r.contentId);
  const commentIds = reports.filter((r) => r.contentType === "COMMENT").map((r) => r.contentId);
  const [posts, comments] = await Promise.all([
    postIds.length
      ? prisma.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, content: true, images: true, isHidden: true, user: { select: { name: true, username: true } } },
        })
      : [],
    commentIds.length
      ? prisma.comment.findMany({
          where: { id: { in: commentIds } },
          select: { id: true, content: true, isHidden: true, user: { select: { name: true, username: true } } },
        })
      : [],
  ]);
  const postMap = new Map(posts.map((p) => [p.id, p]));
  const commentMap = new Map(comments.map((c) => [c.id, c]));

  const items = reports.map((r) => {
    const content =
      r.contentType === "POST" ? postMap.get(r.contentId) : commentMap.get(r.contentId);
    return {
      id: r.id,
      contentType: r.contentType,
      contentId: r.contentId,
      reason: r.reason,
      details: r.details,
      priority: r.priority,
      createdAt: r.createdAt,
      preview: content
        ? {
            text: content.content,
            images: "images" in content ? content.images : [],
            isHidden: content.isHidden,
            author: content.user?.username ?? content.user?.name ?? "user",
          }
        : null,
    };
  });

  return NextResponse.json({ items });
}
