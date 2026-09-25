import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ManualTasksView } from "@/components/user/tasks/manual-tasks-view";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";

export default async function ManualTasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const gate = await getProfileGateState(session.user.id!, "tasks");
  if (gate.locked) return <ProfileGate progress={gate.progress} surface="manual tasks" />;
  return <ManualTasksView />;
}
