import type { Metadata } from "next";
import { ListingDetailPage, listingPageMetadata } from "@/components/user/marketplace/listing-detail-page";

/** A service. Same page as a marketplace listing; non-services redirect to /marketplace/[id]. */

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return listingPageMetadata((await params).id, "services");
}

export default async function ServiceListingPage({ params }: Props) {
  return <ListingDetailPage id={(await params).id} area="services" />;
}
