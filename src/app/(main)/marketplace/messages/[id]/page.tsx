import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DealThreadView } from "@/components/user/marketplace/deal-thread-view";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;
  return <DealThreadView threadId={id} viewerId={session.user.id} />;
}
