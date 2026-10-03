import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { JsonLd } from "@/components/seo/json-ld";
import { CourseGrid, Pagination } from "@/components/public/catalog-lists";
import { indexPageSeo, plainSummary } from "@/lib/public-catalog";
import { getPublicCourseCategories, getPublicCoursePage } from "@/lib/public-catalog-data";
import { breadcrumbLd, itemListLd } from "@/lib/public-catalog-schema";

/**
 * A course category landing page (/courses/category/<slug>). Public,
 * server-rendered from cached reads; the same page for guests and signed-in
 * users. The intro is the category description the admin wrote, when there
 * is one.
 */

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function findCategory(slug: string) {
  return (await getPublicCourseCategories()).find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = await findCategory(slug);
  if (!cat) notFound();
  const seo = indexPageSeo(`/courses/category/${slug}`, await searchParams);
  const title = `${cat.name} Courses – Online Courses${seo.page > 1 ? ` – Page ${seo.page}` : ""}`;
  const description =
    plainSummary(cat.description) || `Online ${cat.name} courses from tutors on RevType — outlines, reviews and prices.`;
  return pageMeta({
    title,
    description,
    path: `/courses/category/${slug}`,
    canonical: seo.canonical,
    robots: seo.robots,
    image: null,
    cardKicker: "Online courses",
  });
}

export default async function CourseCategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const cat = await findCategory(slug);
  if (!cat) notFound();

  const session = await auth();
  if (session?.user?.id) {
    const { enabled } = await getEffectiveFeatures(session.user.id);
    if (!enabled.has("courses")) return <FeatureLock title="Courses" />;
  }

  const base = `/courses/category/${slug}`;
  const { page } = indexPageSeo(base, await searchParams);
  const list = await getPublicCoursePage(slug, page);

  return (
    <div className="space-y-6">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Courses", path: "/courses" },
            { name: cat.name, path: base },
          ]),
          itemListLd(
            `${cat.name} courses`,
            list.items.map((c) => ({ path: c.href, name: c.title }))
          ),
        ]}
      />
      <nav aria-label="Breadcrumb">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1.5 text-sm text-(--app-ink-3) hover:text-(--app-ink)"
        >
          <ChevronLeft className="w-4 h-4" />
          All courses
        </Link>
      </nav>
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{cat.name} courses</h1>
        {cat.description && <p className="text-sm text-(--app-ink-2) max-w-2xl">{cat.description}</p>}
        <p className="text-xs text-(--app-ink-3) tabular-nums">
          {list.total} course{list.total === 1 ? "" : "s"}
          {page > 1 ? ` · page ${page}` : ""}
        </p>
      </header>
      <section aria-label={`${cat.name} courses`}>
        <CourseGrid items={list.items} />
      </section>
      <Pagination basePath={base} page={page} total={list.total} />
    </div>
  );
}
