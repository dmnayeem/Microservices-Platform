import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ProfileView } from "@/components/user/profile/profile-view";
import { LinkStatusToast } from "@/components/user/profile/link-status-toast";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <>
      <Suspense fallback={null}>
        <LinkStatusToast />
      </Suspense>
      <ProfileView />
    </>
  );
}
