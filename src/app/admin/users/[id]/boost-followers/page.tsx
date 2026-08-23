import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BoostFollowersView } from "@/components/admin/users/boost-followers-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoostFollowersPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await can(session.user.id, "users.edit"))) redirect("/admin/users");

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      followersCount: true,
      displayFollowersBoost: true,
    },
  });
  if (!user) notFound();

  return (
    <BoostFollowersView
      userId={user.id}
      userName={user.name ?? user.username ?? "User"}
      avatar={user.avatar}
      realFollowers={user.followersCount}
      displayBoost={user.displayFollowersBoost}
    />
  );
}
