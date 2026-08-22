import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SettingsView } from "@/components/user/settings/settings-view";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      emailNotifications: true,
      pushNotifications: true,
      twoFactorEnabled: true,
      language: true,
      // Only used as a boolean — a Google-only account has no password, and
      // showing it a "current password" field is a dead end.
      password: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <SettingsView
      email={user.email}
      emailNotifications={user.emailNotifications}
      pushNotifications={user.pushNotifications}
      twoFactorEnabled={user.twoFactorEnabled}
      hasPassword={user.password !== null}
      language={user.language ?? "en"}
    />
  );
}
