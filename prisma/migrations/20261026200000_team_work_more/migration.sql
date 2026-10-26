-- Team Work: recurring tasks + visibility by department / by staff role.
-- AlterTable
ALTER TABLE "WorkTask" ADD COLUMN     "recurrence" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "recurrenceParentId" TEXT,
ADD COLUMN     "visibleDepartmentId" TEXT,
ADD COLUMN     "visibleRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "WorkTask_recurrenceParentId_idx" ON "WorkTask"("recurrenceParentId");
