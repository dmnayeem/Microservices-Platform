import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ChevronLeft, Users, Megaphone } from "lucide-react";
import { CourseBuilder } from "@/components/admin/courses/course-builder/CourseBuilder";
import { loadCategoryOptions } from "@/lib/course-categories";
import { buildBuilderInitialFromCourse } from "@/lib/course-builder-load";

export default async function TutorEditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;

  const courseRaw = await prisma.course.findUnique({
    where: { id },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } },
      },
      lessons: { where: { moduleId: null }, orderBy: { order: "asc" } },
    },
  });
  if (!courseRaw) notFound();
  if (courseRaw.tutorId !== session.user.id) {
    redirect("/tutor/courses");
  }

  const categories = await loadCategoryOptions();
  // Prisma Accelerate's TS types collapse `include` payloads; assert the shape.
  const initial = buildBuilderInitialFromCourse(
    courseRaw as unknown as Parameters<typeof buildBuilderInitialFromCourse>[0]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Link
            href="/tutor/courses"
            className="inline-flex items-center gap-1 text-xs text-(--app-ink-3) hover:text-white"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to my courses
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1">Edit course</h1>
          <p className="text-(--app-ink-3) text-sm mt-1">
            {courseRaw.title}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/tutor/courses/${id}/students`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-sm font-bold"
          >
            <Users className="w-4 h-4" />
            Students
          </Link>
          <Link
            href={`/tutor/courses/${id}/announcements`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-sm font-bold"
          >
            <Megaphone className="w-4 h-4" />
            Announcements
          </Link>
        </div>
      </div>

      <CourseBuilder
        role="tutor"
        courseId={id}
        initial={initial}
        categories={categories}
      />
    </div>
  );
}
