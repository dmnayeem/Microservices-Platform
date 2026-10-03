import { auth } from "@/lib/auth";
import { redirect, notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";
import { loadCourseLanding } from "@/lib/course-landing";
import { CourseLanding } from "@/components/user/courses/CourseLanding";
import { JsonLd } from "@/components/seo/json-ld";
import { plainSummary } from "@/lib/public-catalog";
import { absoluteImage, getPublicCourseLanding } from "@/lib/public-catalog-data";
import { breadcrumbLd, courseLd } from "@/lib/public-catalog-schema";

/**
 * A course's landing (sales) page. Public: a logged-out visitor and a search
 * engine get the full page — outline, tutor, reviews, Q&A, FAQ — from a
 * cached read, with Enrol / Save turned into "sign in". The curriculum is an
 * outline only (no lesson bodies or video URLs, for anyone). A signed-in
 * viewer gets the page they always had, with their enrolment state.
 */

type Props = { params: Promise<{ slug: string }> };
type Landing = NonNullable<Awaited<ReturnType<typeof getPublicCourseLanding>>>;

function coursePath(c: Landing["course"]): string {
  return `/courses/${c.slug ?? c.id}`;
}

function structuredData(data: Landing) {
  const c = data.course;
  const path = coursePath(c);
  const reviewCount = Object.values(data.ratingBreakdown ?? {}).reduce((a, b) => a + Number(b || 0), 0);
  const images = [c.bannerUrl, c.thumbnail]
    .map((s) => absoluteImage(s))
    .filter((s): s is string => !!s);
  return [
    courseLd({
      path,
      title: c.title,
      description: c.seoDescription || c.subtitle || c.description || c.title,
      language: c.language,
      isFree: c.isFree,
      price: Number(c.discountPrice ?? c.price ?? 0),
      images,
      tutorName: c.tutor?.name ?? null,
      category: c.category_rel?.name ?? c.category ?? null,
      skillLevel: c.skillLevel ?? null,
      totalDuration: c.totalDuration,
      avgRating: Number(c.avgRating || 0),
      reviewCount,
      reviews: data.reviews.map((r) => ({
        author: r.user?.name || "Student",
        rating: r.rating,
        body: r.comment ?? r.title,
        date: new Date(r.createdAt).toISOString().slice(0, 10),
      })),
      datePublished: c.publishedAt ? new Date(c.publishedAt).toISOString().slice(0, 10) : null,
    }),
    breadcrumbLd([
      { name: "Courses", path: "/courses" },
      ...(c.category_rel ? [{ name: c.category_rel.name, path: `/courses/category/${c.category_rel.slug}` }] : []),
      { name: c.title, path },
    ]),
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicCourseLanding(slug);
  // Thrown here so the response is a real 404, not a streamed 200.
  if (!data) notFound();
  const c = data.course;
  const path = coursePath(c);
  const category = c.category_rel?.name ?? c.category ?? "Online course";
  const title = c.seoTitle || `${c.title} – ${category} Course`;
  const description = plainSummary(c.seoDescription || c.subtitle || c.description) || undefined;
  return pageMeta({
    title,
    description,
    path,
    // Only PUBLISHED courses load at all; anything else is a 404.
    robots: { index: true, follow: true },
    image: c.bannerUrl || c.thumbnail || null,
    imageAlt: c.title,
    cardKicker: `${category} course`,
  });
}

export default async function CourseLandingPage({ params }: Props) {
  const session = await auth();
  const { slug } = await params;

  // ── Logged-out visitor: the cached public payload ────────────────────────
  if (!session?.user?.id) {
    const data = await getPublicCourseLanding(slug);
    if (!data) notFound();
    // The legacy /courses/<id> address of a course that has a slug.
    if (data.course.slug && data.course.slug !== slug && slug === data.course.id) {
      permanentRedirect(`/courses/${data.course.slug}`);
    }
    return (
      <>
        <JsonLd data={structuredData(data)} />
        <CourseLanding data={data} viewerId="" guest />
      </>
    );
  }

  // ── Signed in: unchanged ─────────────────────────────────────────────────
  const data = await loadCourseLanding({ slugOrId: slug, userId: session.user.id });
  if (!data) notFound();

  // If the URL used the legacy /:id form but the course has a slug, redirect
  // to the canonical /:slug URL. (Only when the param is the id, not the slug.)
  if (data.course.slug && data.course.slug !== slug && slug === data.course.id) {
    redirect(`/courses/${data.course.slug}`);
  }

  // Structured data from the same cached public read the metadata used.
  const pub = await getPublicCourseLanding(slug);

  return (
    <>
      {pub && <JsonLd data={structuredData(pub)} />}
      <CourseLanding data={data} viewerId={session.user.id} />
    </>
  );
}
