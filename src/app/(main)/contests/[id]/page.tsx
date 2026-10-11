import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ContestDetailView } from "@/components/user/contests/contest-detail-view";

export const metadata = { title: "Contest" };

export default async function ContestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return <ContestDetailView contestId={id} />;
}
