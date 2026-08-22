import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WelcomeForm } from "./welcome-form";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  // Deliberately UNCACHED. This is the third safety net: if the JWT claim is
  // stale and the bypass cookie was cleared, the middleware would keep sending
  // the user here forever. Reading fresh lets the form detect "already done"
  // and end the loop itself.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, name: true, onboardedAt: true },
  });
  if (!user) redirect("/login");

  return (
    <WelcomeForm
      currentUsername={user.username}
      name={user.name}
      alreadyDone={user.onboardedAt !== null}
    />
  );
}
