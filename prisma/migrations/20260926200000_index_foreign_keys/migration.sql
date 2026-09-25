-- CreateIndex
CREATE INDEX "User_fraudRisk_idx" ON "User"("fraudRisk");

-- CreateIndex
CREATE INDEX "Broadcast_createdById_idx" ON "Broadcast"("createdById");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_userId_idx" ON "BroadcastRecipient"("userId");

-- CreateIndex
CREATE INDEX "FinanceFieldDef_categoryId_idx" ON "FinanceFieldDef"("categoryId");

-- CreateIndex
CREATE INDEX "FinanceEntry_approvedById_idx" ON "FinanceEntry"("approvedById");

-- CreateIndex
CREATE INDEX "FinanceEntry_createdById_idx" ON "FinanceEntry"("createdById");

-- CreateIndex
CREATE INDEX "FinanceEntry_recurringId_idx" ON "FinanceEntry"("recurringId");

-- CreateIndex
CREATE INDEX "RecurringEntry_categoryId_idx" ON "RecurringEntry"("categoryId");

-- CreateIndex
CREATE INDEX "RecurringEntry_employeeId_idx" ON "RecurringEntry"("employeeId");

-- CreateIndex
CREATE INDEX "RecurringEntry_payeeId_idx" ON "RecurringEntry"("payeeId");


-- Declared in schema.prisma all along, but no migration ever created it.
CREATE INDEX IF NOT EXISTS "Mission_unlockMissionId_idx" ON "Mission"("unlockMissionId");
