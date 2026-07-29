import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CoursePlayerShell } from "@/components/user/courses/player/CoursePlayerShell";

export default async function CoursePlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { courseId } = await params;
  const { lesson: lessonParam } = await searchParams;

  // Resolve course (id OR slug)
  const courseRow = await prisma.course.findFirst({
    where: { OR: [{ id: courseId }, { slug: courseId }] },
    select: {
      id: true,
      slug: true,
      title: true,
      thumbnail: true,
      status: true,
      tutorId: true,
      certificateEnabled: true,
      totalLessons: true,
      totalDuration: true,
    },
  });
  if (!courseRow) notFound();

  // Must be enrolled (or the tutor / admin) to enter the player
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { courseId_userId: { courseId: courseRow.id, userId: session.user.id } },
    select: { id: true, progress: true, completedAt: true },
  });
  if (!enrollment && courseRow.tutorId !== session.user.id) {
    redirect(`/courses/${courseRow.slug ?? courseRow.id}`);
  }

  // Curriculum — Accelerate collapses `include` payloads; assert the shape.
  const modulesRaw = (await prisma.courseModule.findMany({
    where: { courseId: courseRow.id },
    orderBy: { order: "asc" },
    include: { lessons: { orderBy: { order: "asc" } } },
  })) as unknown as Array<{
    id: string;
    title: string;
    description: string | null;
    order: number;
    lessons: Array<{
      id: string;
      title: string;
      description: string | null;
      content: string | null;
      videoUrl: string | null;
      subtitlesUrl: string | null;
      duration: number;
      order: number;
      isPreview: boolean;
      lessonType: string;
      resources: unknown;
      quizId: string | null;
      assignmentId: string | null;
      liveClassId: string | null;
    }>;
  }>;
  const orphanLessons = await prisma.courseLesson.findMany({
    where: { courseId: courseRow.id, moduleId: null },
    orderBy: { order: "asc" },
  });

  // Per-lesson progress for the current learner
  const progressRows = enrollment
    ? await prisma.courseLessonProgress.findMany({
        where: { enrollmentId: enrollment.id },
        select: {
          lessonId: true,
          watchedSeconds: true,
          totalSeconds: true,
          lastPosition: true,
          isCompleted: true,
          notes: true,
          bookmarks: true,
        },
      })
    : [];
  const progressByLesson = new Map(progressRows.map((p) => [p.lessonId, p]));

  // Narrow row used by buildLessons — matches modulesRaw.lessons shape.
  interface LessonRow {
    id: string;
    title: string;
    description: string | null;
    content: string | null;
    videoUrl: string | null;
    subtitlesUrl: string | null;
    duration: number;
    order: number;
    isPreview: boolean;
    lessonType: string;
    resources: unknown;
    quizId: string | null;
    assignmentId: string | null;
    liveClassId: string | null;
  }
  const buildLessons = (lessons: LessonRow[]) =>
    lessons.map((l) => {
      const p = progressByLesson.get(l.id);
      return {
        id: l.id,
        title: l.title,
        description: l.description,
        content: l.content,
        // Raw URL withheld — the player fetches a signed URL from /stream.
        hasVideo: !!l.videoUrl,
        subtitlesUrl: l.subtitlesUrl,
        duration: l.duration,
        isPreview: l.isPreview,
        lessonType: l.lessonType,
        resources: Array.isArray(l.resources) ? l.resources : null,
        quizId: l.quizId,
        assignmentId: l.assignmentId,
        liveClassId: l.liveClassId,
        progress: p
          ? {
              watchedSeconds: p.watchedSeconds,
              totalSeconds: p.totalSeconds,
              lastPosition: p.lastPosition,
              isCompleted: p.isCompleted,
              notes: p.notes,
              bookmarks: p.bookmarks,
            }
          : null,
      };
    });

  type ModuleRow = (typeof modulesRaw)[number];
  const moduleList = (modulesRaw as ModuleRow[]).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    lessons: buildLessons(m.lessons),
  }));
  if (orphanLessons.length > 0) {
    moduleList.unshift({
      id: "_orphan",
      title: "Course content",
      description: null,
      lessons: buildLessons(orphanLessons as unknown as LessonRow[]),
    });
  }

  // Pick initial lesson — explicit ?lesson= override, else first incomplete, else first
  let initialLessonId: string | null = null;
  const allLessonsFlat = moduleList.flatMap((m) => m.lessons);
  if (lessonParam) {
    const match = allLessonsFlat.find((l) => l.id === lessonParam);
    if (match) initialLessonId = match.id;
  }
  if (!initialLessonId) {
    const firstIncomplete = allLessonsFlat.find((l) => !l.progress?.isCompleted);
    initialLessonId = firstIncomplete?.id ?? allLessonsFlat[0]?.id ?? null;
  }

  return (
    <CoursePlayerShell
      course={{
        id: courseRow.id,
        slug: courseRow.slug,
        title: courseRow.title,
        thumbnail: courseRow.thumbnail,
        certificateEnabled: courseRow.certificateEnabled,
        totalLessons: courseRow.totalLessons,
        totalDuration: courseRow.totalDuration,
      }}
      enrollment={{
        id: enrollment?.id ?? null,
        progress: enrollment?.progress ?? 0,
        completedAt: enrollment?.completedAt ?? null,
      }}
      modules={moduleList}
      initialLessonId={initialLessonId}
      viewerId={session.user.id}
    />
  );
}
