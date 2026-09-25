import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CustomTasksView } from "@/components/user/tasks/custom-tasks-view";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";

export default async function CustomTasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const gate = await getProfileGateState(session.user.id!, "tasks");
  if (gate.locked) return <ProfileGate progress={gate.progress} surface="custom tasks" />;
  return <CustomTasksView />;
}
