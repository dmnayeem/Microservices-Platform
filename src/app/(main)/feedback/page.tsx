import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FeedbackHubView } from "@/components/user/feedback/feedback-hub-view";

export const metadata = { title: "Feedback" };

export default async function FeedbackPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <Suspense>
      <FeedbackHubView />
    </Suspense>
  );
}
