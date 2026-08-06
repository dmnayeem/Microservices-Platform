import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OfferwallCatalogView } from "@/components/user/offerwalls/offerwall-catalog-view";

export const dynamic = "force-dynamic";

export default async function OfferwallsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <OfferwallCatalogView />;
}
