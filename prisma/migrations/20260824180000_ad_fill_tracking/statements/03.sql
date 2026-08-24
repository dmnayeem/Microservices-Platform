ALTER TABLE "AdServeDailyStat" ADD CONSTRAINT "AdServeDailyStat_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
