-- CreateTable
CREATE TABLE "WorkOption" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "positionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkProject" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "teamId" TEXT,
    "leadId" TEXT,
    "createdById" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "progressMode" TEXT NOT NULL DEFAULT 'TASKS',
    "manualProgress" INTEGER NOT NULL DEFAULT 0,
    "acceptance" TEXT,
    "dependsOnId" TEXT,
    "startAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTask" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "instructions" TEXT,
    "projectId" TEXT,
    "milestoneId" TEXT,
    "categoryId" TEXT,
    "teamId" TEXT,
    "createdById" TEXT NOT NULL,
    "managerId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "visibility" TEXT NOT NULL DEFAULT 'PARTICIPANTS',
    "targetMode" TEXT NOT NULL DEFAULT 'SHARED',
    "reviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "acceptance" TEXT,
    "estimatedHours" DOUBLE PRECISION,
    "startAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "dependsOnId" TEXT,
    "completedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "lastReportAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTaskMember" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTaskMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTarget" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "platformId" TEXT,
    "unitLabel" TEXT NOT NULL DEFAULT 'items',
    "quantity" INTEGER NOT NULL,
    "originalQuantity" INTEGER NOT NULL,
    "assigneeId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkReport" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "summary" TEXT,
    "inProgress" TEXT,
    "blockers" TEXT,
    "nextSteps" TEXT,
    "nextUpdateAt" TIMESTAMP(3),
    "links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attachments" JSONB,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkReportLine" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "WorkReportLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkActivity" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "projectId" TEXT,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkRequest" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOption_kind_isActive_idx" ON "WorkOption"("kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOption_kind_label_key" ON "WorkOption"("kind", "label");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTeam_name_key" ON "WorkTeam"("name");

-- CreateIndex
CREATE INDEX "WorkTeamMember_userId_idx" ON "WorkTeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTeamMember_teamId_userId_key" ON "WorkTeamMember"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkProject_number_key" ON "WorkProject"("number");

-- CreateIndex
CREATE INDEX "WorkProject_status_idx" ON "WorkProject"("status");

-- CreateIndex
CREATE INDEX "WorkProject_teamId_idx" ON "WorkProject"("teamId");

-- CreateIndex
CREATE INDEX "WorkMilestone_projectId_idx" ON "WorkMilestone"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTask_number_key" ON "WorkTask"("number");

-- CreateIndex
CREATE INDEX "WorkTask_status_idx" ON "WorkTask"("status");

-- CreateIndex
CREATE INDEX "WorkTask_createdById_idx" ON "WorkTask"("createdById");

-- CreateIndex
CREATE INDEX "WorkTask_teamId_idx" ON "WorkTask"("teamId");

-- CreateIndex
CREATE INDEX "WorkTask_projectId_idx" ON "WorkTask"("projectId");

-- CreateIndex
CREATE INDEX "WorkTask_milestoneId_idx" ON "WorkTask"("milestoneId");

-- CreateIndex
CREATE INDEX "WorkTask_dueAt_idx" ON "WorkTask"("dueAt");

-- CreateIndex
CREATE INDEX "WorkTaskMember_userId_idx" ON "WorkTaskMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTaskMember_taskId_userId_key" ON "WorkTaskMember"("taskId", "userId");

-- CreateIndex
CREATE INDEX "WorkTarget_taskId_idx" ON "WorkTarget"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkReport_idempotencyKey_key" ON "WorkReport"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkReport_taskId_status_idx" ON "WorkReport"("taskId", "status");

-- CreateIndex
CREATE INDEX "WorkReport_status_createdAt_idx" ON "WorkReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkReportLine_targetId_idx" ON "WorkReportLine"("targetId");

-- CreateIndex
CREATE INDEX "WorkComment_taskId_createdAt_idx" ON "WorkComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkActivity_taskId_createdAt_idx" ON "WorkActivity"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkActivity_projectId_createdAt_idx" ON "WorkActivity"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkRequest_toId_status_idx" ON "WorkRequest"("toId", "status");

-- CreateIndex
CREATE INDEX "WorkRequest_taskId_createdAt_idx" ON "WorkRequest"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkTeamMember" ADD CONSTRAINT "WorkTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "WorkTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkMilestone" ADD CONSTRAINT "WorkMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "WorkMilestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskMember" ADD CONSTRAINT "WorkTaskMember_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTarget" ADD CONSTRAINT "WorkTarget_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReportLine" ADD CONSTRAINT "WorkReportLine_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WorkReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReportLine" ADD CONSTRAINT "WorkReportLine_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "WorkTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequest" ADD CONSTRAINT "WorkRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
