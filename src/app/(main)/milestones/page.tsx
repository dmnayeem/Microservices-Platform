import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MilestonesView } from "@/components/user/gamification/milestones-view";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

export default async function MilestonesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <>
      <AdRenderer placement="MILESTONES_TOP" className="mb-4" />
      <MilestonesView />
    </>
  );
}
