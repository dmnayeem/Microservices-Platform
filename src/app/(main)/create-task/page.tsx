import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CreateTaskView } from "@/components/user/tasks/create-task-view";
import { getEffectiveFeatures } from "@/lib/packages";
import { getPointsPerUsd } from "@/lib/economy";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { getBuyerSettings } from "@/lib/buyer-settings";
import { getTaskCredit } from "@/lib/task-credit";
import { getBuyerScope } from "@/lib/buyer-scope";
import { SOCIAL_PLATFORMS } from "@/lib/social-tasks";

export default async function CreateTaskPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { enabled } = await getEffectiveFeatures(session.user.id);
  // Somebody who came here to PAY people for a job is exactly the person who
  // should be applying for buyer access, and this lock sent them nowhere —
  // alone among the gated pages, six of which already offer the link. It is
  // the most likely reason not one buyer application has ever been submitted.
  //
  // The second lock below deliberately has no apply link: that one means the
  // admin has switched buyer creation off, which applying cannot fix.
  if (!enabled.has("createTasks")) {
    return <FeatureLock title="Create Task" applyHref="/profile/become-creator" />;
  }

  const [pointsPerUsd, buyer, taskCredit, scope] = await Promise.all([
    getPointsPerUsd(),
    getBuyerSettings(),
    getTaskCredit(session.user.id),
    getBuyerScope(session.user.id),
  ]);

  // Only the platforms this buyer may target, with their real actions. Sent
  // as data rather than imported by the client: the full catalog is ~3,000
  // lines and the form needs a key, a label and the action list.
  const platforms = SOCIAL_PLATFORMS.filter((p) =>
    scope.platforms.includes(p.key)
  ).map((p) => ({
    key: p.key,
    label: p.label,
    emoji: p.emoji,
    actions: p.actions.map((a) => ({ key: a.key, label: a.label })),
  }));

  // The admin master switch closes the form as well as the API. Showing the
  // form and failing on submit would waste the buyer's time composing a task
  // that was never going to be accepted.
  if (!buyer.enabled || scope.types.length === 0) {
    return (
      <FeatureLock
        title="Create Task"
        message="Buyer task creation is turned off at the moment. Please check back later."
      />
    );
  }

  return (
    <CreateTaskView
      pointsPerUsd={pointsPerUsd}
      canTarget={enabled.has("targetTasks")}
      feePercent={buyer.feePercent}
      minPoints={buyer.minPointsPerTask}
      maxPoints={buyer.maxPointsPerTask}
      maxCompletions={buyer.maxCompletions}
      allowedTypes={scope.types}
      platforms={platforms}
      suspendedNote={scope.blocks.note}
      needsReview={!buyer.autoApproveTasks}
      taskCredit={taskCredit}
    />
  );
}
