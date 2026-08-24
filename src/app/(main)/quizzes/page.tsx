import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { QuizzesView } from "@/components/user/quizzes/quizzes-view";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

export default async function QuizzesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <>
      <AdRenderer placement="QUIZZES_TOP" className="mb-4" />
      <QuizzesView />
    </>
  );
}
