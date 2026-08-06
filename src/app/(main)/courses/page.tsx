import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { CoursesBrowse } from "@/components/user/courses/CoursesBrowse";
import { GraduationCap } from "lucide-react";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";

export default async function CoursesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("courses")) return <FeatureLock title="Courses" />;

  // Featured strip — server-rendered for fast first paint
  const featuredRaw = await prisma.course.findMany({
    where: {
      status: "PUBLISHED",
      isFeatured: true,
      nsfw: false,
    },
    orderBy: { publishedAt: "desc" },
    take: 6,
    include: {
      tutor: { select: { id: true, name: true, avatar: true } },
      _count: { select: { lessons: true } },
    },
  });
  const featured = featuredRaw as unknown as Array<{
    id: string;
    slug: string | null;
    title: string;
    subtitle: string | null;
    thumbnail: string | null;
    isFree: boolean;
    price: number;
    discountPrice: number | null;
    avgRating: number;
    enrollmentCount: number;
    totalDuration: number;
    tutor: { id: string; name: string | null; avatar: string | null } | null;
    _count: { lessons: number };
  }>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-300" />
            Courses
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Earn from learning. Hands-on courses by tutors across the platform.
          </p>
        </div>
      </div>

      <CoursesBrowse
        initialFeatured={featured.map((c) => ({
          id: c.id,
          slug: c.slug,
          title: c.title,
          subtitle: c.subtitle,
          thumbnail: c.thumbnail,
          isFree: c.isFree,
          price: toNum(c.price),
          discountPrice: toNumOrNull(c.discountPrice),
          avgRating: c.avgRating,
          enrollmentCount: c.enrollmentCount,
          totalDuration: c.totalDuration,
          tutor: c.tutor,
          totalLessons: c._count.lessons,
          href: `/courses/${c.slug ?? c.id}`,
        }))}
      />
    </div>
  );
}
