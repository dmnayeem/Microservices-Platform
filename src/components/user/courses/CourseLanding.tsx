"use client";

import { useEffect } from "react";
import {
  Star,
  Users,
  Clock,
  Globe,
  Award,
  CheckCircle2,
} from "lucide-react";
import { CourseLandingHero } from "./CourseLandingHero";
import { Avatar } from "@/components/user/primitives/avatar";
import { CourseCurriculum } from "./CourseCurriculum";
import { CourseReviews } from "./CourseReviews";
import { CourseQA } from "./CourseQA";
import { RelatedCourses } from "./RelatedCourses";
import { CourseEnrollCta } from "./CourseEnrollCta";
import { StatCard } from "@/components/user/primitives/stat-card";
import { AffiliateAttribution } from "@/components/user/affiliate/affiliate-attribution";
import { AffiliateShareButton } from "@/components/user/affiliate/affiliate-share-button";
import { AffiliateRewardBadge } from "@/components/user/affiliate/affiliate-reward-badge";

interface Props {
  // From loadCourseLanding — shape is encapsulated here on purpose
  data: Awaited<ReturnType<typeof import("@/lib/course-landing").loadCourseLanding>>;
  viewerId: string;
}

export function CourseLanding({ data, viewerId }: Props) {
  // Fire-and-forget view tracker. Server-side dedupes by sessionHash so an
  // anonymous reload won't double-count.
  useEffect(() => {
    if (!data) return;
    const id = data.course.id;
    fetch(`/api/courses/${id}/view`, { method: "POST" }).catch(() => {});
  }, [data]);

  if (!data) return null;

  const {
    course,
    enrollment,
    bookmarked,
    myReview,
    reviews,
    questions,
    ratingBreakdown,
    related,
  } = data;

  const livePrice = course.discountPrice ?? course.price;
  const moduleList = course.modules.length > 0
    ? course.modules
    : course.lessons.length > 0
    ? [
        {
          id: "_orphan",
          title: "Course content",
          description: null,
          lessons: course.lessons,
        },
      ]
    : [];

  const faqs = Array.isArray(course.faqs)
    ? (course.faqs as Array<{ question: string; answer: string }>)
    : [];

  return (
    <div className="space-y-10">
      <AffiliateAttribution targetType="COURSE" targetId={course.id} />
      {data.affiliateEligible && (
        <div className="flex justify-end items-center gap-2">
          <AffiliateRewardBadge
            reward={(data as { affiliateReward?: string | null }).affiliateReward}
          />
          <AffiliateShareButton eligible />
        </div>
      )}
      <CourseLandingHero
        course={course}
        tutor={course.tutor}
        livePrice={livePrice}
      />

      {/* Two-column main body */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <main className="space-y-8 min-w-0">
          {/* Learning outcomes */}
          {course.learningOutcomes.length > 0 && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-white mb-3">What you&apos;ll learn</h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {course.learningOutcomes.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* At-a-glance facts */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Star className="w-5 h-5" />} tone="amber" label="Rating" value={course.avgRating > 0 ? course.avgRating.toFixed(1) : "—"} />
            <StatCard icon={<Users className="w-5 h-5" />} tone="green" label="Students" value={course.enrollmentCount} />
            <StatCard icon={<Clock className="w-5 h-5" />} tone="blue" label="Duration" value={`${Math.round(course.totalDuration / 60)}h ${course.totalDuration % 60}m`} />
            <StatCard icon={<Globe className="w-5 h-5" />} tone="purple" label="Language" value={course.language.toUpperCase()} />
          </section>

          {/* Description */}
          <section className="card p-5">
            <h2 className="text-base font-bold text-white mb-3">About this course</h2>
            <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-gray-300">
              {course.description}
            </div>
            {course.lastContentUpdate && (
              <p className="text-xs text-gray-500 mt-4">
                Last updated {new Date(course.lastContentUpdate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </p>
            )}
          </section>

          {/* Curriculum */}
          <CourseCurriculum
            courseId={course.id}
            modules={moduleList}
            isEnrolled={!!enrollment}
            totalLessons={course.totalLessons}
            totalDuration={course.totalDuration}
          />

          {/* Requirements */}
          {course.requirements.length > 0 && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-white mb-3">Requirements</h2>
              <ul className="space-y-1.5">
                {course.requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-gray-500">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* What's included */}
          {course.whatsIncluded.length > 0 && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-white mb-3">What&apos;s included</h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {course.whatsIncluded.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-200">
                    <CheckCircle2 className="w-4 h-4 text-indigo-300 mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Tutor profile */}
          {course.tutor && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-white mb-3">Your tutor</h2>
              <div className="flex items-start gap-3">
                <Avatar
                  src={course.tutor.avatar}
                  size={56}
                  fallbackStyle="solid-gray"
                  fallbackText={(course.tutor.name ?? "?").slice(0, 1).toUpperCase()}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold">{course.tutor.name}</p>
                  {course.tutor.tutorProfile?.headline && (
                    <p className="text-sm text-indigo-300">
                      {course.tutor.tutorProfile.headline}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                    {course.tutor.tutorProfile?.avgRating ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                        {course.tutor.tutorProfile.avgRating.toFixed(1)}
                      </span>
                    ) : null}
                    <span>{course.tutor.tutorProfile?.totalCourses ?? 0} courses</span>
                    <span>{course.tutor.tutorProfile?.totalStudents ?? 0} students</span>
                  </div>
                  {course.tutor.tutorProfile?.bio && (
                    <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">
                      {course.tutor.tutorProfile.bio}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Reviews */}
          <CourseReviews
            courseId={course.id}
            avgRating={course.avgRating}
            totalReviews={course.totalReviews}
            breakdown={ratingBreakdown}
            reviews={reviews}
            canReview={!!enrollment}
            myReview={myReview}
          />

          {/* Q&A */}
          <CourseQA
            courseId={course.id}
            initial={questions}
            isEnrolled={!!enrollment}
            viewerId={viewerId}
            tutorId={course.tutorId}
          />

          {/* FAQ */}
          {faqs.length > 0 && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-white mb-3">FAQ</h2>
              <ul className="space-y-3">
                {faqs.map((f, i) => (
                  <li key={i}>
                    <p className="text-sm font-bold text-white">Q: {f.question}</p>
                    <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">
                      {f.answer}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Certificate info */}
          {course.certificateEnabled && (
            <section className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-5 flex items-start gap-3">
              <Award className="w-6 h-6 text-emerald-300 mt-0.5 shrink-0" />
              <div>
                <p className="text-white font-bold">
                  Certificate on completion
                </p>
                <p className="text-sm text-emerald-100/80 mt-1">
                  Finish every lesson and pass any quizzes to earn a shareable
                  certificate of completion.
                </p>
              </div>
            </section>
          )}

          {/* Related */}
          {related.length > 0 && (
            <RelatedCourses
              related={related as unknown as Array<{
                id: string;
                slug: string | null;
                title: string;
                thumbnail: string | null;
                isFree: boolean;
                price: number;
                discountPrice: number | null;
                avgRating: number;
                enrollmentCount: number;
              }>}
            />
          )}
        </main>

        {/* Sticky sidebar — enrol CTA */}
        <aside className="lg:sticky lg:top-6 self-start">
          <CourseEnrollCta
            courseId={course.id}
            slug={course.slug}
            title={course.title}
            isFree={course.isFree}
            price={course.price}
            originalPrice={course.originalPrice}
            discountPrice={course.discountPrice}
            thumbnail={course.thumbnail}
            promoVideoUrl={course.promoVideoUrl}
            isEnrolled={!!enrollment}
            isBookmarked={bookmarked}
            certificateEnabled={course.certificateEnabled}
            totalLessons={course.totalLessons}
            totalDuration={course.totalDuration}
          />
        </aside>
      </div>
    </div>
  );
}

