import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MissionsView } from "@/components/user/missions/missions-view";

export default async function MissionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <MissionsView />;
}
