import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SocialTasksView } from "@/components/user/tasks/social-tasks-view";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";

export default async function SocialTasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const gate = await getProfileGateState(session.user.id!, "tasks");
  if (gate.locked) return <ProfileGate progress={gate.progress} surface="social tasks" />;
  // Engagement only. Post-creation tasks have their own page (/social-posts,
  // `kind="create"`), and showing them here as well meant the same task
  // appeared twice under two different promises: "like, comment, share" here
  // and "write a post, copy the caption, publish, paste the link" there. They
  // are different work and now live in different places.
  return (
    <SocialTasksView
      kind="engage"
      subheading="Like, comment, share, follow, subscribe — proof-verified. Tasks where you WRITE a post live under Social Posts."
    />
  );
}
