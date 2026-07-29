-- Marketplace seller-listing moderation + stock-media metadata.
-- Adds PENDING_REVIEW / REJECTED listing statuses and the moderation +
-- extracted-file-metadata columns. Existing rows stay ACTIVE (grandfathered);
-- new user listings are created PENDING_REVIEW by the API.

-- AlterEnum
ALTER TYPE "MarketplaceListingStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "MarketplaceListingStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "MarketplaceListing" ADD COLUMN     "fileMeta" JSONB,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;
