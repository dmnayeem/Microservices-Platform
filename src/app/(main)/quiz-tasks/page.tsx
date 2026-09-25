import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { QuizTasksView } from "@/components/user/tasks/quiz-tasks-view";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";

export default async function QuizTasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const gate = await getProfileGateState(session.user.id!, "tasks");
  if (gate.locked) return <ProfileGate progress={gate.progress} surface="quiz tasks" />;
  return <QuizTasksView />;
}
