import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ReferralTreeView } from "@/components/admin/referrals/referral-tree-view";

export default async function ReferralTreePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "referrals.view"))) redirect("/admin");

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      referralCode: true,
      package: { select: { slug: true, name: true } },
    },
  });
  if (!user) notFound();

  return (
    <ReferralTreeView
      userId={user.id}
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        referralCode: user.referralCode,
        packageTier: user.package?.name ?? "—",
      }}
    />
  );
}
