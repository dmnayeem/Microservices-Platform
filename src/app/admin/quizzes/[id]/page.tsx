import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// The admin list links here for "view" and for "?archive=1". Archive when asked,
// otherwise send the admin straight to the editor.
export default async function QuizViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ archive?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "quizzes.view"))) redirect("/admin");

  const { id } = await params;
  const { archive } = await searchParams;

  if (archive === "1" && await can(session.user.id, "quizzes.manage")) {
    await prisma.quiz
      .update({ where: { id }, data: { status: "ARCHIVED" } })
      .catch(() => {});
    redirect("/admin/quizzes");
  }

  redirect(`/admin/quizzes/${id}/edit`);
}
