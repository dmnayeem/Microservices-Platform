import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CreateTaskView } from "@/components/user/tasks/create-task-view";
import { getEffectiveFeatures } from "@/lib/packages";
import { getPointsPerUsd } from "@/lib/economy";
import { FeatureLock } from "@/components/user/primitives/feature-lock";

export default async function CreateTaskPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("createTasks")) return <FeatureLock title="Create Task" />;

  const pointsPerUsd = await getPointsPerUsd();
  return (
    <CreateTaskView
      pointsPerUsd={pointsPerUsd}
      canTarget={enabled.has("targetTasks")}
    />
  );
}
