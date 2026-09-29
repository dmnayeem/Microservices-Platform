import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { TutorShell } from "@/components/tutor/TutorShell";
import { getHiddenPaths } from "@/lib/page-visibility-server";
import { isPathHidden } from "@/lib/page-visibility";

export default async function TutorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "tutor.dashboard")) {
    redirect("/profile/become-tutor");
  }

  // Super-admin page visibility: every route in this layout is under /tutor,
  // so no pathname is needed. getHiddenPaths fails open (→ nothing hidden).
  if (isPathHidden("/tutor", await getHiddenPaths(session.user.id ?? ""))) {
    redirect("/no-access");
  }

  return (
    <TutorShell
      user={{
        id: session.user.id ?? "",
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        avatar: (session.user as { avatar?: string | null })?.avatar ?? null,
      }}
    >
      {children}
    </TutorShell>
  );
}
