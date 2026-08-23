import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TaskForm } from "../../_components/TaskForm";
import type { SocialConfig } from "@/lib/social-tasks";
import type { ArticleConfig } from "@/lib/article-tasks";
import type { VideoConfig } from "@/lib/video-tasks";
import type { SurveyConfig } from "@/lib/survey-tasks";
import type { CustomConfig } from "@/lib/custom-tasks";
import type { AppInstallConfig } from "@/lib/app-install-tasks";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTaskPage({ params }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!(await can(session.user.id, "tasks.edit"))) {
    redirect("/admin/tasks");
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
  });

  if (!task) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/admin/tasks/${id}`}
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Edit Task</h1>
          <p className="text-gray-400">{task.title}</p>
        </div>
      </div>

      {/* Form */}
      <TaskForm
        task={{
          ...task,
          socialConfig: task.socialConfig as SocialConfig | null,
          articleConfig: task.articleConfig as ArticleConfig | null,
          videoConfig: task.videoConfig as VideoConfig | null,
          surveyConfig: task.surveyConfig as SurveyConfig | null,
          customConfig: task.customConfig as CustomConfig | null,
          appInstallConfig: task.appInstallConfig as AppInstallConfig | null,
        }}
      />
    </div>
  );
}
