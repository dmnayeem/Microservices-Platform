import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { QuizzesView } from "@/components/user/quizzes/quizzes-view";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";

export default async function QuizzesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const gate = await getProfileGateState(session.user.id!, "quizzes");
  if (gate.locked) return <ProfileGate progress={gate.progress} surface="quiz games" />;
  return (
    <>
      <AdRenderer placement="QUIZZES_TOP" className="mb-4" />
      <QuizzesView />
    </>
  );
}
