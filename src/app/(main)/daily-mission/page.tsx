import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DailyMissionView } from "@/components/user/missions/daily-mission-view";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

export default async function DailyMissionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const gate = await getProfileGateState(session.user.id);
  if (gate.locked) {
    return <ProfileGate progress={gate.progress} surface="the Daily Mission" />;
  }

  return (
    <>
      <AdRenderer placement="DAILY_MISSION_TOP" className="mb-4" />
      <DailyMissionView />
    </>
  );
}
