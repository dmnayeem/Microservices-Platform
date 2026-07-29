-- Sequential task unlock (feature #7): per-task ordering column + supporting
-- index so the chain query can order eligible ACTIVE tasks by `order` cheaply.
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Task_status_order_idx" ON "Task"("status", "order");

