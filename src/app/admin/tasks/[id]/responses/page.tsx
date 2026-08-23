import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SurveyResponsesLazy } from "@/components/admin/tasks/survey-responses-lazy";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SurveyResponsesPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await can(session.user.id, "submissions.view"))) redirect("/admin");

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, title: true, type: true },
  });
  if (!task) notFound();
  if (task.type !== "SURVEY") {
    redirect(`/admin/tasks/${id}`);
  }

  const canExport = await can(session.user.id, "analytics.export");

  return (
    <SurveyResponsesLazy
      taskId={task.id}
      taskTitle={task.title}
      canExport={canExport}
    />
  );
}
