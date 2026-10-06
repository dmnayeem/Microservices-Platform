-- Held tutor share of a paid course enrolment (released by the scheduler).
CREATE TABLE IF NOT EXISTS "CourseTutorPayout" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "releaseAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseTutorPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CourseTutorPayout_enrollmentId_key" ON "CourseTutorPayout"("enrollmentId");
CREATE INDEX IF NOT EXISTS "CourseTutorPayout_status_releaseAt_idx" ON "CourseTutorPayout"("status", "releaseAt");
CREATE INDEX IF NOT EXISTS "CourseTutorPayout_tutorId_status_idx" ON "CourseTutorPayout"("tutorId", "status");
CREATE INDEX IF NOT EXISTS "CourseTutorPayout_courseId_idx" ON "CourseTutorPayout"("courseId");
