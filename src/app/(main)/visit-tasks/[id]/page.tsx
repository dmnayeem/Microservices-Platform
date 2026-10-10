import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { VisitTaskDetailView } from "@/components/user/tasks/visit-task-detail-view";

export default async function VisitTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("visitTasks")) return <FeatureLock title="Visit Tasks" />;

  const { id } = await params;
  return (
    <Suspense>
      <VisitTaskDetailView taskId={id} />
    </Suspense>
  );
}
