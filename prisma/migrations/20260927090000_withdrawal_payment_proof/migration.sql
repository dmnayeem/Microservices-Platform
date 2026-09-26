-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "paidFrom" TEXT,
ADD COLUMN     "paymentProof" TEXT[] DEFAULT ARRAY[]::TEXT[];

