import { auth } from "@/lib/auth";
import Link from "next/link";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { CoursesBrowse } from "@/components/user/courses/CoursesBrowse";
import { GraduationCap } from "lucide-react";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { JsonLd } from "@/components/seo/json-ld";
import { CourseGrid, Pagination } from "@/components/public/catalog-lists";
import { indexPageSeo } from "@/lib/public-catalog";
import { getPublicCourseCategories, getPublicCoursePage } from "@/lib/public-catalog-data";
import { breadcrumbLd, itemListLd } from "@/lib/public-catalog-schema";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TITLE = "Online Courses – Learn New Skills";
const DESCRIPTION =
  "Hands-on online courses from tutors on RevType — free and paid, with a curriculum outline, student reviews and a certificate on completion where offered.";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const seo = indexPageSeo("/courses", await searchParams);
  return pageMeta({
    title: seo.page > 1 ? `${TITLE} – Page ${seo.page}` : TITLE,
    description: DESCRIPTION,
    path: "/courses",
    canonical: seo.canonical,
    robots: seo.robots,
    image: null,
    cardKicker: "Online courses",
  });
}

export default async function CoursesPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) return <PublicCoursesIndex searchParams={await searchParams} />;

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
            <GraduationCap className="w-6 h-6 text-(--app-accent-ink)" />
            Courses
          </h1>
          <p className="text-sm text-(--app-ink-3) mt-1">
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

/**
 * What a logged-out visitor and a search engine get: published courses,
 * server-rendered from cached reads, every card a real link.
 */
async function PublicCoursesIndex({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { page } = indexPageSeo("/courses", searchParams);
  const [categories, list] = await Promise.all([
    getPublicCourseCategories(),
    getPublicCoursePage(null, page),
  ]);
  return (
    <div className="space-y-8">
      <JsonLd
        data={[
          breadcrumbLd([{ name: "Courses", path: "/courses" }]),
          itemListLd(
            "Courses",
            list.items.map((c) => ({ path: c.href, name: c.title }))
          ),
        ]}
      />
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white inline-flex items-center gap-2">
          <GraduationCap className="w-7 h-7 text-(--app-accent-ink)" aria-hidden />
          Courses
        </h1>
        <p className="text-sm text-(--app-ink-2) max-w-2xl">
          Hands-on courses by tutors across the platform. Read the full outline and reviews here —
          sign in when you want to enrol.
        </p>
      </header>

      {categories.length > 0 && (
        <nav aria-label="Course categories" className="space-y-2">
          <h2 className="text-lg font-bold text-white">Categories</h2>
          <ul className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/courses/category/${c.slug}`}
                  className="inline-block rounded-full border border-(--app-line) bg-(--app-surface) px-3 py-1.5 text-xs font-semibold text-(--app-ink-2) hover:text-(--app-ink)"
                >
                  {c.name} courses
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <section aria-label="All courses" className="space-y-3">
        <p className="text-xs text-(--app-ink-3) tabular-nums">
          {list.total} course{list.total === 1 ? "" : "s"}
          {page > 1 ? ` · page ${page}` : ""}
        </p>
        <CourseGrid items={list.items} />
        <Pagination basePath="/courses" page={page} total={list.total} />
      </section>
    </div>
  );
}
