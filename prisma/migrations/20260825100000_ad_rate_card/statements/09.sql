CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdSlotBooking_placementId_status_startAt_endAt_idx" ON "AdSlotBooking"("placementId", "status", "startAt", "endAt");
