import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/admin/courses/:id/analytics
// Returns funnel + 14-day daily views + recent activity for a course.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const course = await prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        slug: true,
        thumbnail: true,
        uniqueViewers: true,
        enrollmentCount: true,
        avgRating: true,
        totalReviews: true,
        totalRevenueCents: true,
      },
    });
    if (!course) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const [
      totalViews,
      enrollAgg,
      completionAgg,
      certCount,
      reviewCount,
      questionCount,
      bookmarkCount,
      recentViewsRaw,
      recentEnrolls,
      activeBookmarksCount,
    ] = await Promise.all([
      prisma.courseListingView.count({ where: { courseId: id } }),
      prisma.courseEnrollment.aggregate({
        where: { courseId: id },
        _sum: { pricePaid: true },
        _count: { _all: true },
      }),
      prisma.courseEnrollment.count({
        where: { courseId: id, completedAt: { not: null } },
      }),
      prisma.courseCertificate.count({ where: { courseId: id } }),
      prisma.courseReview.count({ where: { courseId: id } }),
      prisma.courseQuestion.count({ where: { courseId: id } }),
      prisma.courseBookmark.count({ where: { courseId: id } }),
      prisma.courseListingView.findMany({
        where: { courseId: id, viewedAt: { gte: fourteenDaysAgo } },
        select: { viewedAt: true },
      }),
      prisma.courseEnrollment.findMany({
        where: { courseId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      }),
      prisma.courseBookmark.count({ where: { courseId: id } }),
    ]);

    // Bucket views into 14 daily buckets
    const dayBuckets: Array<{ date: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayBuckets.push({ date: key, count: 0 });
    }
    const dayIndex = new Map(dayBuckets.map((b, i) => [b.date, i]));
    for (const v of recentViewsRaw) {
      const key = v.viewedAt.toISOString().slice(0, 10);
      const i = dayIndex.get(key);
      if (i !== undefined) dayBuckets[i].count += 1;
    }

    const enrollments = enrollAgg._count._all;
    const revenue = (enrollAgg._sum.pricePaid ?? 0);
    const completions = completionAgg;

    return NextResponse.json({
      course,
      funnel: {
        views: totalViews,
        uniqueViewers: course.uniqueViewers,
        bookmarks: bookmarkCount,
        enrollments,
        completions,
        certificates: certCount,
      },
      meta: {
        reviewCount,
        questionCount,
        bookmarkCount: activeBookmarksCount,
        avgRating: course.avgRating,
        revenue,
      },
      dailyViews: dayBuckets,
      recentEnrolls,
    });
  } catch (error) {
    console.error("Course analytics failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
