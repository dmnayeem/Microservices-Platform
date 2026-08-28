import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isGroupsEnabled } from "@/lib/groups-gate";
import { GroupDetailView } from "@/components/user/groups/group-detail-view";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // Feature switch. A bookmarked group URL must not be a way back into a
  // feature the admin has turned off — back to the feed instead.
  if (!(await isGroupsEnabled())) redirect("/social");
  const { id } = await params;

  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) notFound();

  return (
    <GroupDetailView
      groupId={id}
      currentUserId={session.user.id}
    />
  );
}
