import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OfferwallCatalogView } from "@/components/user/offerwalls/offerwall-catalog-view";

// No `force-dynamic`: the body is a client component with no server data, and
// `auth()` already makes this page dynamic. Declaring it again bought nothing
// and opted the route out of every optimisation Next can apply.

export default async function OfferwallsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <OfferwallCatalogView />;
}
