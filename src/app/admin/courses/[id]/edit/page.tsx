import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { CourseBuilder } from "@/components/admin/courses/course-builder/CourseBuilder";
import { loadCategoryOptions } from "@/lib/course-categories";
import { buildBuilderInitialFromCourse } from "@/lib/course-builder-load";

export default async function AdminEditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "courses.manage"))) redirect("/admin/courses");

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

  const categories = await loadCategoryOptions();
  // Prisma Accelerate's TS types collapse `include` payloads; assert the shape.
  const initial = buildBuilderInitialFromCourse(
    courseRaw as unknown as Parameters<typeof buildBuilderInitialFromCourse>[0]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/courses"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700"
        >
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Edit course</h1>
          <p className="text-sm text-slate-400">{courseRaw.title}</p>
        </div>
      </div>
      <CourseBuilder
        role="admin"
        courseId={id}
        initial={initial}
        categories={categories}
      />
    </div>
  );
}
