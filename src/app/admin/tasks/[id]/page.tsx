import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BrandIcon } from "@/components/ui/brand-icon";
import {
  ArrowLeft,
  Video,
  FileText,
  HelpCircle,
  ClipboardList,
  Share2,
  Globe,
  Gift,
  Sparkles,
  Star,
  Clock,
  Users,
  CheckCircle,
  Target,
  Layers,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { TaskDetailActions } from "@/components/admin/task-actions";
import { taskDisplayId } from "@/lib/display-id";
import {
  normalizeSocialConfig,
  getPlatform,
  getAction,
} from "@/lib/social-tasks";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Icon and color mapping for task types
const taskTypeConfig: Record<string, { icon: typeof Video; color: string; bgColor: string }> = {
  VIDEO: { icon: Video, color: "text-red-400", bgColor: "bg-red-500/10" },
  ARTICLE: { icon: FileText, color: "text-blue-400", bgColor: "bg-blue-500/10" },
  QUIZ: { icon: HelpCircle, color: "text-amber-400", bgColor: "bg-amber-500/10" },
  SURVEY: { icon: ClipboardList, color: "text-purple-400", bgColor: "bg-purple-500/10" },
  SOCIAL: { icon: Share2, color: "text-pink-400", bgColor: "bg-pink-500/10" },
  PROXY: { icon: Globe, color: "text-cyan-400", bgColor: "bg-cyan-500/10" },
  OFFERWALL: { icon: Gift, color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  CUSTOM: { icon: Sparkles, color: "text-indigo-400", bgColor: "bg-indigo-500/10" },
};

export default async function TaskDetailPage({ params }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "tasks.view")) {
    redirect("/admin/tasks");
  }

  const { id } = await params;

  const taskRaw = await prisma.task.findUnique({
    where: { id },
    include: {
      _count: {
        select: { submissions: true },
      },
      submissions: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              level: true,
            },
          },
        },
      },
    },
  });

  if (!taskRaw) {
    notFound();
  }

  // Type assertion for Prisma Accelerate
  type TaskWithSubmissions = typeof taskRaw & {
    _count: { submissions: number };
    submissions: Array<{
      id: string;
      status: string;
      createdAt: Date;
      proof: string | null;
      proofImages: string[];
      user: {
        id: string;
        name: string | null;
        email: string;
        avatar: string | null;
        level: number;
      };
    }>;
  };
  const task = taskRaw as TaskWithSubmissions;

  const config = taskTypeConfig[task.type] || taskTypeConfig.CUSTOM;
  const Icon = config.icon;

  const canEdit = hasPermission(adminRole, "tasks.edit");
  const canDelete = hasPermission(adminRole, "tasks.delete");
  const canCreate = hasPermission(adminRole, "tasks.create");

  // Parse instructions into steps
  const instructionSteps = task.instructions?.split("\n").filter(Boolean) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/tasks"
            className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${config.bgColor}`}>
              <Icon className={`w-6 h-6 ${config.color}`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{task.title}</h1>
              <p className="text-[11px] font-mono text-gray-500 mt-0.5">
                {taskDisplayId(task.id)}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs ${config.bgColor} ${config.color}`}>
                  {task.type}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  task.status === "ACTIVE"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : task.status === "PAUSED"
                    ? "bg-amber-500/10 text-amber-400"
                    : task.status === "COMPLETED"
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-red-500/10 text-red-400"
                }`}>
                  {task.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {task.type === "SURVEY" && (
            <Link
              href={`/admin/tasks/${task.id}/responses`}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg"
            >
              <ClipboardList className="w-4 h-4" />
              View Responses
            </Link>
          )}
          <TaskDetailActions
            taskId={task.id}
            taskTitle={task.title}
            taskStatus={task.status}
            canEdit={canEdit}
            canDelete={canDelete}
            canCreate={canCreate}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-indigo-400" />
            <span className="text-xs text-gray-500">Points Reward</span>
          </div>
          <p className="text-2xl font-bold text-white">{task.pointsReward.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-gray-500">XP Reward</span>
          </div>
          <p className="text-2xl font-bold text-white">{task.xpReward}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-gray-500">Total Submissions</span>
          </div>
          <p className="text-2xl font-bold text-white">{task._count.submissions}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-gray-500">Completed</span>
          </div>
          <p className="text-2xl font-bold text-white">{task.completedCount}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Description</h2>
            <p className="text-gray-400 whitespace-pre-wrap">{task.description}</p>
          </div>

          {/* Instructions */}
          {(task.instructionVideoUrl || instructionSteps.length > 0) && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
              <h2 className="text-lg font-semibold text-white">Instructions</h2>

              {/* Video Instructions */}
              {task.instructionVideoUrl && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Video className="w-4 h-4 text-red-400" />
                    <h3 className="text-sm font-medium text-gray-300">Video Instructions</h3>
                  </div>
                  <YouTubePlayer url={task.instructionVideoUrl} />
                </div>
              )}

              {/* Text Instructions */}
              {instructionSteps.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-medium text-gray-300">Text Instructions</h3>
                  </div>
                  <div className="space-y-3">
                    {instructionSteps.map((step, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <span className="w-6 h-6 shrink-0 flex items-center justify-center bg-indigo-500/10 rounded-full text-xs text-indigo-400">
                          {index + 1}
                        </span>
                        <p className="text-gray-400">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Social bundle info */}
          {task.type === "SOCIAL" &&
            (() => {
              const norm = normalizeSocialConfig(task.socialConfig);
              if (!norm.platform && norm.items.length === 0) return null;
              const platform = getPlatform(norm.platform);
              return (
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold text-white">
                      Social Media Bundle
                    </h2>
                    {platform && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-pink-500/10 border border-pink-500/30 text-pink-300">
                        <BrandIcon brand={platform.key} fallback={platform.emoji} colored className="w-3.5 h-3.5" />
                        {platform.label}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
                      {norm.items.length} action
                      {norm.items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {norm.items.map((item, idx) => {
                      const action = getAction(norm.platform, item.action);
                      const target =
                        item.fields?.targetUrl || item.fields?.targetHandle;
                      const pr = item.proofRequirements;
                      const extraFields = action?.adminFields.filter(
                        (f) =>
                          f.key !== "targetUrl" &&
                          f.key !== "targetHandle" &&
                          (item.fields[f.key] ?? "").trim()
                      );
                      return (
                        <div
                          key={idx}
                          className="rounded-lg border border-gray-800 bg-gray-950 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-semibold text-white">
                              {action
                                ? `${action.emoji} ${action.label}`
                                : item.action}
                            </span>
                            <span className="text-amber-400 font-bold text-xs tabular-nums">
                              +{item.points}
                            </span>
                            {item.watchSeconds ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                                ⏱ {item.watchSeconds}s
                              </span>
                            ) : null}
                          </div>

                          {target && (
                            <a
                              href={target}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 break-all"
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span className="break-all">{target}</span>
                            </a>
                          )}

                          {extraFields && extraFields.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {extraFields.map((f) => (
                                <p
                                  key={f.key}
                                  className="text-xs text-gray-400 wrap-break-word"
                                >
                                  <span className="text-gray-500">
                                    {f.label}:
                                  </span>{" "}
                                  {item.fields[f.key]}
                                </p>
                              ))}
                            </div>
                          )}

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.aiPromptEnabled && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">
                                AI prompt
                              </span>
                            )}
                            {pr.url && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                                Proof URL
                              </span>
                            )}
                            {pr.screenshot && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                                Screenshot
                              </span>
                            )}
                            {pr.username && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                                Username
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

          {task.type === "PROXY" && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Proxy Task Details</h2>
              <div className="space-y-4">
                {task.contentUrl && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Target URL</p>
                    <a
                      href={task.contentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                    >
                      {task.contentUrl}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
                {task.countries.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Target Countries</p>
                    <div className="flex flex-wrap gap-2">
                      {task.countries.map((country) => (
                        <span
                          key={country}
                          className="px-2 py-1 bg-gray-800 rounded text-sm text-gray-400"
                        >
                          {country}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {task.proxyInstructions && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Proxy Instructions</p>
                    <p className="text-gray-400 whitespace-pre-wrap">{task.proxyInstructions}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Submissions */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Recent Submissions</h2>
              <Link
                href={`/admin/submissions?taskId=${task.id}`}
                className="text-sm text-indigo-400 hover:text-indigo-300"
              >
                View All
              </Link>
            </div>

            {task.submissions.length > 0 ? (
              <div className="space-y-4">
                {task.submissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium">
                        {submission.user.name?.charAt(0) || submission.user.email.charAt(0)}
                      </div>
                      <div>
                        <Link
                          href={`/admin/users/${submission.user.id}`}
                          className="text-white hover:text-indigo-400 transition-colors"
                        >
                          {submission.user.name || submission.user.email}
                        </Link>
                        <p className="text-xs text-gray-500">
                          Level {submission.user.level} • {formatDistanceToNow(submission.createdAt, { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      submission.status === "APPROVED" || submission.status === "AUTO_APPROVED"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : submission.status === "PENDING"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-red-500/10 text-red-400"
                    }`}>
                      {submission.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">No submissions yet</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Requirements */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Requirements</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-400">Min Level</span>
                </div>
                <span className="text-white">{task.minLevel}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-400">Min access level</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-500/10 text-indigo-400">
                  {task.requiredAccessLevel}
                </span>
              </div>
              {task.duration && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-400">Min Duration</span>
                  </div>
                  <span className="text-white">{task.duration}s</span>
                </div>
              )}
            </div>
          </div>

          {/* Limits */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Limits</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Daily Limit</span>
                <span className="text-white">{task.dailyLimit || "Unlimited"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Total Slots</span>
                <span className="text-white">
                  {task.totalLimit ? `${task.completedCount} / ${task.totalLimit}` : "Unlimited"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Cooldown</span>
                <span className="text-white">
                  {task.cooldownMinutes > 0 ? `${task.cooldownMinutes} min` : "None"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Auto-approve</span>
                <span className={task.autoApprove ? "text-emerald-400" : "text-gray-500"}>
                  {task.autoApprove ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Schedule</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Created</p>
                <p className="text-white text-sm">
                  {format(task.createdAt, "MMM d, yyyy HH:mm")}
                </p>
              </div>
              {task.startsAt && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Start Date</p>
                  <p className="text-white text-sm">
                    {format(task.startsAt, "MMM d, yyyy HH:mm")}
                  </p>
                </div>
              )}
              {task.expiresAt && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">End Date</p>
                  <p className="text-white text-sm">
                    {format(task.expiresAt, "MMM d, yyyy HH:mm")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
