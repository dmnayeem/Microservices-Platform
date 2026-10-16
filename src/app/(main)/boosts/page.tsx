import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MyBoostsView } from "@/components/user/boost/my-boosts-view";

export const metadata = { title: "My boosts" };

export default async function BoostsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await searchParams;
  // `?id=` comes from a post card's "View stats" link — open that boost first.
  return <MyBoostsView focusId={typeof id === "string" ? id : null} />;
}
