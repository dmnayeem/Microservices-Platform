import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LeaderboardView } from "@/components/user/leaderboard/leaderboard-view";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

export default async function LeaderboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <>
      <AdRenderer placement="LEADERBOARD_TOP" className="mb-4" />
      <LeaderboardView currentUserId={session.user.id} />
    </>
  );
}
