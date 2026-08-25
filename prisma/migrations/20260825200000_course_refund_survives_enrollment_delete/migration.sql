-- Approving a course refund deletes the enrolment so the student can buy the
-- course again. Under the old `ON DELETE CASCADE` that delete also destroyed the
-- `CourseRefundRequest` row the same transaction then tried to mark APPROVED,
-- raising P2025 and rolling the entire refund back — no course refund had ever
-- succeeded. `SET NULL` lets the enrolment go while the refund record survives
-- as the audit trail.

ALTER TABLE "CourseRefundRequest" DROP CONSTRAINT "CourseRefundRequest_enrollmentId_fkey";

ALTER TABLE "CourseRefundRequest" ALTER COLUMN "enrollmentId" DROP NOT NULL;

ALTER TABLE "CourseRefundRequest" ADD CONSTRAINT "CourseRefundRequest_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
