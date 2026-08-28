import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SavedPostsView } from "@/components/user/feed/saved-posts-view";

export const metadata = { title: "Saved" };

export default async function SavedPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <SavedPostsView
      currentUserId={session.user.id}
      currentUserRole={session.user.role ?? null}
    />
  );
}
