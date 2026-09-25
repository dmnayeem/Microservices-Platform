import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { AppInstallListView } from "@/components/user/tasks/app-install-list-view";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";

export default async function AppInstallTasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const gate = await getProfileGateState(session.user.id!, "tasks");
  if (gate.locked) return <ProfileGate progress={gate.progress} surface="app install tasks" />;

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("appInstall")) return <FeatureLock title="App Install Tasks" />;

  return <AppInstallListView />;
}
