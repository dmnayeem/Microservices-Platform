import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LevelRewardsCard } from "@/components/user/gamification/level-rewards-card";

export const metadata = { title: "Level Rewards" };

export default async function LevelRewardsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="t-title text-white">Level Rewards</h1>
        <p className="t-body text-(--app-ink-3) mt-1">Reach a level, claim its points — once per level.</p>
      </div>
      <LevelRewardsCard />
    </div>
  );
}
