-- Company finance & HR: the company's own books (expenses, other income, tax
-- paid to the authority), employees with or without a platform account,
-- payees, recurring costs, custom fields; plus the FINANCE_MODERATOR role and
-- the super-admin-only finance grant column.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'FINANCE_MODERATOR';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "financeGrants" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EXPENSE',
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceFieldDef" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "categoryId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payee" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMPANY',
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "paymentMethod" TEXT,
    "paymentDetails" TEXT,
    "taxId" TEXT,
    "notes" TEXT,
    "customFields" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "department" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "nationalId" TEXT,
    "photoUrl" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinDate" TIMESTAMP(3),
    "leaveDate" TIMESTAMP(3),
    "salaryAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "salaryCurrency" TEXT NOT NULL DEFAULT 'BDT',
    "salaryCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "commissionNote" TEXT,
    "commissionPct" DECIMAL(9,4),
    "paymentMethod" TEXT,
    "paymentDetails" TEXT,
    "emergencyContact" TEXT,
    "notes" TEXT,
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EXPENSE',
    "categoryId" TEXT NOT NULL,
    "employeeId" TEXT,
    "payeeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "usdRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "amountUsd" DECIMAL(18,6) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmountUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "taxLabel" TEXT,
    "period" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "reference" TEXT,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "dedupeKey" TEXT,
    "recurringId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringEntry" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EXPENSE',
    "categoryId" TEXT NOT NULL,
    "employeeId" TEXT,
    "payeeId" TEXT,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxLabel" TEXT,
    "dueDay" INTEGER NOT NULL DEFAULT 1,
    "startPeriod" TEXT NOT NULL,
    "endPeriod" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastPeriod" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_slug_key" ON "FinanceCategory"("slug");

-- CreateIndex
CREATE INDEX "FinanceCategory_kind_isActive_order_idx" ON "FinanceCategory"("kind", "isActive", "order");

-- CreateIndex
CREATE INDEX "FinanceFieldDef_entity_isActive_order_idx" ON "FinanceFieldDef"("entity", "isActive", "order");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceFieldDef_entity_categoryId_key_key" ON "FinanceFieldDef"("entity", "categoryId", "key");

-- CreateIndex
CREATE INDEX "Payee_kind_isActive_idx" ON "Payee"("kind", "isActive");

-- CreateIndex
CREATE INDEX "Payee_name_idx" ON "Payee"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "Employee_name_idx" ON "Employee"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_dedupeKey_key" ON "FinanceEntry"("dedupeKey");

-- CreateIndex
CREATE INDEX "FinanceEntry_kind_status_period_idx" ON "FinanceEntry"("kind", "status", "period");

-- CreateIndex
CREATE INDEX "FinanceEntry_period_idx" ON "FinanceEntry"("period");

-- CreateIndex
CREATE INDEX "FinanceEntry_categoryId_period_idx" ON "FinanceEntry"("categoryId", "period");

-- CreateIndex
CREATE INDEX "FinanceEntry_employeeId_period_idx" ON "FinanceEntry"("employeeId", "period");

-- CreateIndex
CREATE INDEX "FinanceEntry_payeeId_idx" ON "FinanceEntry"("payeeId");

-- CreateIndex
CREATE INDEX "FinanceEntry_paidAt_idx" ON "FinanceEntry"("paidAt");

-- CreateIndex
CREATE INDEX "FinanceEntry_status_dueDate_idx" ON "FinanceEntry"("status", "dueDate");

-- CreateIndex
CREATE INDEX "RecurringEntry_isActive_idx" ON "RecurringEntry"("isActive");

-- AddForeignKey
ALTER TABLE "FinanceFieldDef" ADD CONSTRAINT "FinanceFieldDef_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "Payee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringEntry" ADD CONSTRAINT "RecurringEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringEntry" ADD CONSTRAINT "RecurringEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringEntry" ADD CONSTRAINT "RecurringEntry_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "Payee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

