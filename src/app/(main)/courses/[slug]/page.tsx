import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { loadCourseLanding } from "@/lib/course-landing";
import { CourseLanding } from "@/components/user/courses/CourseLanding";
import { JsonLd } from "@/components/seo/json-ld";

export default async function CourseLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { slug } = await params;
  const data = await loadCourseLanding({ slugOrId: slug, userId: session.user.id });
  if (!data) notFound();

  // If the URL used the legacy /:id form but the course has a slug, redirect
  // to the canonical /:slug URL. (Only when the param is the id, not the slug.)
  if (data.course.slug && data.course.slug !== slug && slug === data.course.id) {
    redirect(`/courses/${data.course.slug}`);
  }

  const c = data.course;
  const reviewCount = Object.values(
    (data.ratingBreakdown ?? {}) as Record<string, number>
  ).reduce((a, b) => a + Number(b || 0), 0);
  const courseLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: c.title,
    description: c.seoDescription ?? c.subtitle ?? undefined,
    provider: { "@type": "Organization", name: "EarnGPT" },
    ...(c.avgRating && reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(c.avgRating).toFixed(1),
            reviewCount,
          },
        }
      : {}),
  };

  return (
    <>
      <JsonLd data={courseLd} />
      <CourseLanding data={data} viewerId={session.user.id} />
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadCourseLanding({ slugOrId: slug, userId: null });
  if (!data) return { title: "Course not found" };
  return {
    title: data.course.seoTitle ?? data.course.title,
    description: data.course.seoDescription ?? data.course.subtitle ?? undefined,
    alternates: {
      canonical: `/courses/${data.course.slug ?? data.course.id}`,
    },
    openGraph: {
      title: data.course.seoTitle ?? data.course.title,
      description: data.course.seoDescription ?? data.course.subtitle ?? undefined,
      images: data.course.bannerUrl
        ? [data.course.bannerUrl]
        : data.course.thumbnail
        ? [data.course.thumbnail]
        : undefined,
    },
  };
}
