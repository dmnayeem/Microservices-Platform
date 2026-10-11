import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ContestsListView } from "@/components/user/contests/contests-list-view";

export const metadata = { title: "Creator Contests" };

export default async function ContestsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <ContestsListView />;
}
