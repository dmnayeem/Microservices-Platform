import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BadgeShop } from "@/components/user/badges/badge-shop";

export const metadata = { title: "Blue Badge" };

/** The blue badge shop: a monthly verified badge, plus animated styles. */
export default async function BadgePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, username: true, avatar: true },
  });
  return <BadgeShop name={me?.name || me?.username || "You"} avatar={me?.avatar ?? null} />;
}
