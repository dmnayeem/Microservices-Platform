import type { Metadata } from "next";
import { ListingDetailPage, listingPageMetadata } from "@/components/user/marketplace/listing-detail-page";

/** A marketplace listing. Services redirect to /services/[id]. */

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return listingPageMetadata((await params).id, "marketplace");
}

export default async function MarketplaceListingPage({ params }: Props) {
  return <ListingDetailPage id={(await params).id} area="marketplace" />;
}
