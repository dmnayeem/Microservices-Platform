ALTER TABLE "AdSlotBooking" ADD CONSTRAINT "AdSlotBooking_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
