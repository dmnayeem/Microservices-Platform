import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDownloadUrl } from "@/lib/s3";
import { hasPermission, type UserRole } from "@/lib/rbac";

/**
 * Enrollment-gated video source. Returns a short-lived SIGNED URL for our-hosted
 * lesson videos (so shared links expire + non-enrolled users can't fetch), or
 * passes through external (YouTube/Vimeo) URLs. Keeps the raw permanent URL out
 * of the client payload. Deterrence, not DRM — a determined viewer can still
 * screen-record.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, lessonId } = await params;

  const lesson = await prisma.courseLesson.findUnique({
    where: { id: lessonId },
    select: {
      videoUrl: true,
      isPreview: true,
      courseId: true,
      course: { select: { id: true, slug: true, isFree: true, tutorId: true } },
    },
  });
  if (!lesson || !lesson.course) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  // The `id` param may be a course id OR slug — validate it matches this lesson.
  if (lesson.course.id !== id && lesson.course.slug !== id) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  if (!lesson.videoUrl) {
    return NextResponse.json({ error: "No video" }, { status: 404 });
  }

  // Access: free/preview, tutor/admin, or enrolled.
  const role = session.user.role as UserRole | undefined;
  const isOwnerOrAdmin =
    lesson.course.tutorId === session.user.id ||
    hasPermission(role, "courses.manage");
  let allowed = lesson.isPreview || lesson.course.isFree || isOwnerOrAdmin;
  if (!allowed) {
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: {
        courseId_userId: { courseId: lesson.course.id, userId: session.user.id },
      },
      select: { id: true },
    });
    allowed = !!enrollment;
  }
  if (!allowed) {
    return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
  }

  // Resolve the source: sign our-hosted files; pass external URLs through.
  let url = lesson.videoUrl;
  try {
    const host = new URL(lesson.videoUrl).hostname.toLowerCase();
    const ours =
      host.endsWith(".amazonaws.com") ||
      (!!process.env.AWS_CLOUDFRONT_DOMAIN &&
        host === process.env.AWS_CLOUDFRONT_DOMAIN.toLowerCase());
    if (ours) {
      const key = new URL(lesson.videoUrl).pathname.slice(1);
      const signed = await getDownloadUrl(key, 3600);
      if (signed.success && signed.downloadUrl) url = signed.downloadUrl;
    }
  } catch {
    // Malformed URL → fall back to the stored value.
  }

  return NextResponse.json(
    { url },
    { headers: { "Cache-Control": "no-store" } }
  );
}
