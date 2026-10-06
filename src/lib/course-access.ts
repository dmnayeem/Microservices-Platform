import "server-only";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

/**
 * Shared course access rules — one definition for every LMS route.
 *
 *  - The course owner (tutor) and staff with `courses.manage` see everything,
 *    including DRAFT / PENDING_REVIEW courses.
 *  - Everyone else only sees PUBLISHED courses, and only gets lesson CONTENT
 *    (body text, video URL) for free/preview lessons or when enrolled.
 */

/** Grace added to a quiz time limit for network latency on submit. */
export const QUIZ_TIME_GRACE_MS = 30_000;

/**
 * Fraction of a video lesson's length that must elapse (since the server first
 * saw it opened) before it can complete. 0.4 leaves room for 2x playback: the
 * player auto-completes at ~90% watched, which at 2x is ~45% of real time.
 */
export const LESSON_MIN_WATCH_FRACTION = 0.4;
/** Minimum time on any other lesson (text, download …) before it can complete. */
export const LESSON_MIN_OPEN_SECONDS = 10;

export async function canManageCourse(
  userId: string,
  tutorId: string | null | undefined
): Promise<boolean> {
  if (tutorId && tutorId === userId) return true;
  return can(userId, "courses.manage");
}

/** May this viewer read the full content of a lesson? */
export function lessonContentVisible(
  lesson: { isFree: boolean; isPreview: boolean },
  viewer: { enrolled: boolean; manager: boolean }
): boolean {
  return lesson.isFree || lesson.isPreview || viewer.enrolled || viewer.manager;
}

type CompletionLesson = {
  id: string;
  lessonType: string;
  duration: number; // minutes
  videoUrl: string | null;
  quizId: string | null;
  assignmentId: string | null;
};

/**
 * Why this lesson may NOT be marked complete yet, or null when it may.
 *
 * Completion used to be a client claim: a single PATCH `{isCompleted:true}`
 * per lesson finished a course (and minted a certificate) in seconds. Now
 * there must be real, server-observed progress:
 *  - QUIZ lesson       → a passing attempt on its quiz
 *  - ASSIGNMENT lesson → a submission
 *  - VIDEO/LIVE lesson → ≥ LESSON_MIN_WATCH_FRACTION of its length elapsed
 *                        since the server first saw the learner open it
 *  - anything else     → ≥ LESSON_MIN_OPEN_SECONDS since first open
 *
 * `openedAt` is the server timestamp of the lesson's first progress row
 * (`CourseLessonProgress.createdAt`), or null when there is none yet.
 */
export async function lessonCompletionBlock(args: {
  userId: string;
  lesson: CompletionLesson;
  openedAt: Date | null;
}): Promise<string | null> {
  const { userId, lesson, openedAt } = args;

  if (lesson.lessonType === "QUIZ" && lesson.quizId) {
    const pass = await prisma.courseQuizAttempt.findFirst({
      where: { quizId: lesson.quizId, userId, passed: true },
      select: { id: true },
    });
    return pass ? null : "Pass the quiz to complete this lesson.";
  }
  if (lesson.lessonType === "ASSIGNMENT" && lesson.assignmentId) {
    const sub = await prisma.courseAssignmentSubmission.findFirst({
      where: { assignmentId: lesson.assignmentId, userId },
      select: { id: true },
    });
    return sub ? null : "Submit the assignment to complete this lesson.";
  }

  const isVideo =
    (lesson.lessonType === "VIDEO" || lesson.lessonType === "LIVE") &&
    !!lesson.videoUrl &&
    lesson.duration > 0;
  const requiredSeconds = isVideo
    ? Math.max(
        LESSON_MIN_OPEN_SECONDS,
        Math.ceil(lesson.duration * 60 * LESSON_MIN_WATCH_FRACTION)
      )
    : LESSON_MIN_OPEN_SECONDS;

  if (!openedAt) {
    return isVideo
      ? "Watch the lesson before marking it complete."
      : "Spend a moment on this lesson before marking it complete.";
  }
  const elapsed = (Date.now() - openedAt.getTime()) / 1000;
  if (elapsed < requiredSeconds) {
    return isVideo
      ? "Watch more of this lesson before marking it complete."
      : "Spend a moment on this lesson before marking it complete.";
  }
  return null;
}

/**
 * Server first-open timestamp of a lesson for an enrolment, creating the
 * progress row (the "open" marker) when it does not exist yet.
 * Returns null when the row was only just created.
 */
export async function lessonOpenedAt(
  enrollmentId: string,
  lessonId: string,
  durationMinutes: number
): Promise<Date | null> {
  const existing = await prisma.courseLessonProgress.findUnique({
    where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    select: { createdAt: true },
  });
  if (existing) return existing.createdAt;
  await prisma.courseLessonProgress
    .create({
      data: { enrollmentId, lessonId, totalSeconds: durationMinutes * 60 },
    })
    .catch(() => {}); // concurrent create — the other row is the marker
  return null;
}
