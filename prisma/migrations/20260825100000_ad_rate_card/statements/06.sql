ALTER TABLE "AdSlotBooking" ADD CONSTRAINT "AdSlotBooking_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
