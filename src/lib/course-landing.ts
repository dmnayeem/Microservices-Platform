import { prisma } from "@/lib/prisma";
import { toNumOrNull } from "@/lib/money";
import { isAffiliateEligible, formatAffiliateReward } from "@/lib/affiliate";

/** Load the full landing-page payload for a course (by slug or id) + the
 *  current user's enrollment / bookmark / review status. Used by the
 *  /courses/[slug] page and as a refresh source for partial revalidation. */
export async function loadCourseLanding(opts: {
  slugOrId: string;
  userId?: string | null;
}) {
  // Resolve by slug, fall back to id
  const courseRaw = await prisma.course.findFirst({
    where: {
      OR: [{ slug: opts.slugOrId }, { id: opts.slugOrId }],
      status: "PUBLISHED",
    },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } },
      },
      lessons: { where: { moduleId: null }, orderBy: { order: "asc" } },
      tutor: {
        select: {
          id: true,
          name: true,
          avatar: true,
          bio: true,
          tutorProfile: {
            select: {
              headline: true,
              bio: true,
              totalStudents: true,
              totalCourses: true,
              avgRating: true,
              websiteUrl: true,
              twitterUrl: true,
              linkedinUrl: true,
              youtubeUrl: true,
            },
          },
        },
      },
      category_rel: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!courseRaw) return null;

  // Type assertion — Prisma Accelerate collapses include payloads
  const course = courseRaw as unknown as {
    id: string;
    slug: string | null;
    title: string;
    subtitle: string | null;
    description: string;
    thumbnail: string | null;
    bannerUrl: string | null;
    promoVideoUrl: string | null;
    category: string;
    skillLevel: string;
    language: string;
    isFree: boolean;
    price: number;
    originalPrice: number | null;
    discountPrice: number | null;
    discountEndsAt: Date | null;
    learningOutcomes: string[];
    requirements: string[];
    whatsIncluded: string[];
    faqs: unknown;
    seoTitle: string | null;
    seoDescription: string | null;
    totalLessons: number;
    totalDuration: number;
    enrollmentCount: number;
    avgRating: number;
    totalReviews: number;
    certificateEnabled: boolean;
    publishedAt: Date | null;
    lastContentUpdate: Date | null;
    tutorId: string | null;
    affiliateCommissionType: string | null;
    affiliateCommissionValue: number | null;
    tutor: {
      id: string;
      name: string | null;
      avatar: string | null;
      bio: string | null;
      tutorProfile: {
        headline: string | null;
        bio: string;
        totalStudents: number;
        totalCourses: number;
        avgRating: number;
        websiteUrl: string | null;
        twitterUrl: string | null;
        linkedinUrl: string | null;
        youtubeUrl: string | null;
      } | null;
    } | null;
    category_rel: { id: string; name: string; slug: string } | null;
    modules: Array<{
      id: string;
      title: string;
      description: string | null;
      lessons: Array<{
        id: string;
        title: string;
        description: string | null;
        duration: number;
        isPreview: boolean;
        lessonType: string;
        videoUrl: string | null;
      }>;
    }>;
    lessons: Array<{
      id: string;
      title: string;
      description: string | null;
      duration: number;
      isPreview: boolean;
      lessonType: string;
      videoUrl: string | null;
    }>;
  };

  // User-specific data
  let enrollment: { id: string; progress: number; completedAt: Date | null } | null = null;
  let bookmarked = false;
  let myReview: { id: string; rating: number; title: string | null; comment: string | null } | null = null;
  let viewerIsAffiliate = false;
  if (opts.userId) {
    const [enrollRow, bookRow, reviewRow, meRow] = await Promise.all([
      prisma.courseEnrollment.findUnique({
        where: { courseId_userId: { courseId: course.id, userId: opts.userId } },
        select: { id: true, progress: true, completedAt: true },
      }),
      prisma.courseBookmark.findUnique({
        where: { userId_courseId: { userId: opts.userId, courseId: course.id } },
        select: { id: true },
      }),
      prisma.courseReview.findUnique({
        where: { courseId_userId: { courseId: course.id, userId: opts.userId } },
        select: { id: true, rating: true, title: true, comment: true },
      }),
      prisma.user.findUnique({
        where: { id: opts.userId },
        select: { affiliateJoinedAt: true },
      }),
    ]);
    enrollment = enrollRow;
    bookmarked = !!bookRow;
    myReview = reviewRow;
    viewerIsAffiliate = !!meRow?.affiliateJoinedAt;
  }

  // Reviews block
  const reviewsRaw = await prisma.courseReview.findMany({
    where: { courseId: course.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      user: { select: { id: true, name: true, avatar: true } },
    },
  });
  const reviews = reviewsRaw as unknown as Array<{
    id: string;
    rating: number;
    title: string | null;
    comment: string | null;
    createdAt: Date;
    user: { id: string; name: string | null; avatar: string | null };
  }>;

  // Rating breakdown (1..5 counts)
  const ratingBreakdownRaw = await prisma.courseReview.groupBy({
    by: ["rating"],
    where: { courseId: course.id },
    _count: { _all: true },
  });
  const breakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratingBreakdownRaw as Array<{ rating: number; _count: { _all: number } }>) {
    if (r.rating >= 1 && r.rating <= 5) {
      breakdown[r.rating as 1 | 2 | 3 | 4 | 5] = r._count._all;
    }
  }

  // Q&A — most recent 10
  const questionsRaw = await prisma.courseQuestion.findMany({
    where: { courseId: course.id },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 10,
    include: {
      asker: { select: { id: true, name: true, avatar: true } },
      answeredBy: { select: { id: true, name: true, avatar: true } },
    },
  });
  const questions = questionsRaw as unknown as Array<{
    id: string;
    question: string;
    answer: string | null;
    answeredAt: Date | null;
    isPinned: boolean;
    createdAt: Date;
    asker: { id: string; name: string | null; avatar: string | null };
    answeredBy: { id: string; name: string | null; avatar: string | null } | null;
  }>;

  // Related courses — same category, exclude this one
  const relatedRaw = await prisma.course.findMany({
    where: {
      status: "PUBLISHED",
      nsfw: false,
      id: { not: course.id },
      ...(course.category_rel ? { categoryId: course.category_rel.id } : {}),
    },
    orderBy: [{ enrollmentCount: "desc" }, { publishedAt: "desc" }],
    take: 6,
    select: {
      id: true,
      slug: true,
      title: true,
      thumbnail: true,
      isFree: true,
      price: true,
      discountPrice: true,
      avgRating: true,
      enrollmentCount: true,
    },
  });

  return {
    course,
    affiliateEligible: isAffiliateEligible(
      course.affiliateCommissionType,
      toNumOrNull(course.affiliateCommissionValue)
    ),
    // Affiliate-only commission figure — null for non-affiliates.
    affiliateReward: viewerIsAffiliate
      ? formatAffiliateReward(
          course.affiliateCommissionType,
          toNumOrNull(course.affiliateCommissionValue)
        )
      : null,
    enrollment,
    bookmarked,
    myReview,
    reviews,
    questions,
    ratingBreakdown: breakdown,
    related: relatedRaw,
  };
}
