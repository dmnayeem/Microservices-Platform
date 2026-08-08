import { parsePage } from "@/lib/paginate";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ListTodo,
  Search,
  Filter,
  Plus,
  Pause,
  Video,
  FileText,
  HelpCircle,
  ClipboardList,
  Share2,
  Globe,
  Gift,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  Star,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { taskDisplayId } from "@/lib/display-id";
import { Prisma } from "@/generated/prisma/client";
import { TaskActions } from "@/components/admin/task-actions";
import { TaskReviewActions } from "@/components/admin/task-review-actions";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    type?: string;
    difficulty?: string;
    board?: string;
    search?: string;
  }>;
}

// Icon mapping for task types
const taskTypeIcons: Record<string, typeof Video> = {
  VIDEO: Video,
  ARTICLE: FileText,
  QUIZ: HelpCircle,
  SURVEY: ClipboardList,
  SOCIAL: Share2,
  PROXY: Globe,
  OFFERWALL: Gift,
  CUSTOM: Sparkles,
};

const taskTypeColors: Record<string, string> = {
  VIDEO: "text-red-400 bg-red-500/10",
  ARTICLE: "text-blue-400 bg-blue-500/10",
  QUIZ: "text-amber-400 bg-amber-500/10",
  SURVEY: "text-purple-400 bg-purple-500/10",
  SOCIAL: "text-pink-400 bg-pink-500/10",
  PROXY: "text-cyan-400 bg-cyan-500/10",
  OFFERWALL: "text-emerald-400 bg-emerald-500/10",
  CUSTOM: "text-indigo-400 bg-indigo-500/10",
};

export default async function AdminTasksPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "tasks.view")) {
    redirect("/admin");
  }

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  // Build where clause based on filters
  const where: Prisma.TaskWhereInput = {};

  if (params.status && params.status !== "all") {
    where.status = params.status as Prisma.EnumTaskStatusFilter["equals"];
  }

  if (params.type && params.type !== "all") {
    where.type = params.type as Prisma.EnumTaskTypeFilter["equals"];
  }

  if (params.difficulty && params.difficulty !== "all") {
    where.difficulty = params.difficulty as Prisma.EnumTaskDifficultyFilter["equals"];
  }

  if (params.board === "none") {
    where.boardId = null;
  } else if (params.board && params.board !== "all") {
    where.boardId = params.board;
  }

  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: "insensitive" } },
      { description: { contains: params.search, mode: "insensitive" } },
    ];
  }

  // Fetch tasks and stats
  const [
    tasksRaw,
    totalCount,
    activeCount,
    pausedCount,
    completedCount,
    draftCount,
    pendingSubmissions,
    pendingReviewCount,
  ] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    }),
    prisma.task.count({ where }),
    prisma.task.count({ where: { status: "ACTIVE" } }),
    prisma.task.count({ where: { status: "PAUSED" } }),
    prisma.task.count({ where: { status: "COMPLETED" } }),
    prisma.task.count({ where: { status: "DRAFT" } }),
    prisma.taskSubmission.count({ where: { status: "PENDING" } }),
    prisma.task.count({ where: { status: "PENDING_REVIEW" } }),
  ]);

  const boards = await prisma.taskBoard.findMany({
    orderBy: { order: "asc" },
    select: { id: true, title: true },
  });

  // Type assertion for Prisma Accelerate
  type TaskWithCount = typeof tasksRaw[0] & {
    _count: { submissions: number };
  };
  const tasks = tasksRaw as TaskWithCount[];

  const totalPages = Math.ceil(totalCount / pageSize);

  const buildQueryString = (newPage: number) => {
    const queryParams = new URLSearchParams();
    queryParams.set("page", newPage.toString());
    if (params.status) queryParams.set("status", params.status);
    if (params.type) queryParams.set("type", params.type);
    if (params.difficulty) queryParams.set("difficulty", params.difficulty);
    if (params.board) queryParams.set("board", params.board);
    if (params.search) queryParams.set("search", params.search);
    return queryParams.toString();
  };

  const canCreate = hasPermission(adminRole, "tasks.create");
  const canEdit = hasPermission(adminRole, "tasks.edit");
  const canDelete = hasPermission(adminRole, "tasks.delete");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Task Management</h1>
          <p className="text-gray-400 mt-1">
            Create and manage earning tasks
          </p>
        </div>
        <div className="flex gap-3">
          {pendingReviewCount > 0 && (
            <Link
              href="/admin/tasks?status=PENDING_REVIEW"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 rounded-lg hover:bg-indigo-500/20 transition-colors"
            >
              <Clock className="w-4 h-4" />
              Pending Review ({pendingReviewCount})
            </Link>
          )}
          {pendingSubmissions > 0 && (
            <Link
              href="/admin/submissions"
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-colors"
            >
              <Clock className="w-4 h-4" />
              Review Queue ({pendingSubmissions})
            </Link>
          )}
          {canCreate && (
            <Link
              href="/admin/tasks/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Task
            </Link>
          )}
        </div>
      </div>

      {/* Stats — 4-card row per spec (Active / Paused / Completed / Draft) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/admin/tasks?status=ACTIVE"
          className={`bg-slate-900 rounded-xl border p-4 transition-colors ${
            params.status === "ACTIVE" ? "border-emerald-500/50" : "border-slate-800 hover:border-emerald-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">{activeCount}</p>
              <p className="text-sm text-slate-500">Active</p>
            </div>
          </div>
        </Link>
        <Link
          href="/admin/tasks?status=PAUSED"
          className={`bg-slate-900 rounded-xl border p-4 transition-colors ${
            params.status === "PAUSED" ? "border-amber-500/50" : "border-slate-800 hover:border-amber-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Pause className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">{pausedCount}</p>
              <p className="text-sm text-slate-500">Paused</p>
            </div>
          </div>
        </Link>
        <Link
          href="/admin/tasks?status=COMPLETED"
          className={`bg-slate-900 rounded-xl border p-4 transition-colors ${
            params.status === "COMPLETED" ? "border-blue-500/50" : "border-slate-800 hover:border-blue-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <ListTodo className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">{completedCount}</p>
              <p className="text-sm text-slate-500">Completed</p>
            </div>
          </div>
        </Link>
        <Link
          href="/admin/tasks?status=DRAFT"
          className={`bg-slate-900 rounded-xl border p-4 transition-colors ${
            params.status === "DRAFT" ? "border-slate-500/50" : "border-slate-800 hover:border-slate-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-700/40 rounded-lg">
              <FileText className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">{draftCount}</p>
              <p className="text-sm text-slate-500">Draft</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Filters — 5 filters per spec: Search, Type, Status, Difficulty, Board */}
      <form className="bg-slate-900 rounded-xl border border-slate-800 p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="search"
            name="search"
            defaultValue={params.search}
            placeholder="Search title, description, tags…"
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          name="type"
          defaultValue={params.type || "all"}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Types</option>
          <option value="VIDEO">Video</option>
          <option value="ARTICLE">Article</option>
          <option value="QUIZ">Quiz</option>
          <option value="SURVEY">Survey</option>
          <option value="SOCIAL">Social</option>
          <option value="PROXY">Proxy</option>
          <option value="OFFERWALL">Offerwall</option>
          <option value="CUSTOM">Custom</option>
        </select>
        <select
          name="status"
          defaultValue={params.status || "all"}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Status</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="COMPLETED">Completed</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <select
          name="difficulty"
          defaultValue={params.difficulty || "all"}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
        <select
          name="board"
          defaultValue={params.board || "all"}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Boards</option>
          <option value="none">No Board</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        <div className="lg:col-span-6 flex items-center justify-between gap-3 pt-2 border-t border-slate-800 mt-1">
          <Link href="/admin/tasks" className="text-sm text-slate-400 hover:text-white">
            Reset all
          </Link>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-sm text-white hover:bg-blue-700 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Apply Filters
          </button>
        </div>
      </form>

      {/* Tasks Grid */}
      {tasks.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => {
            const Icon = taskTypeIcons[task.type] || Sparkles;
            const colorClass = taskTypeColors[task.type] || "text-gray-400 bg-gray-500/10";

            return (
              <div
                key={task.id}
                className="bg-gray-900 rounded-xl border border-gray-800 p-5 hover:border-gray-700 transition-colors"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${colorClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${colorClass}`}>
                        {task.type}
                      </span>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    task.status === "ACTIVE"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : task.status === "PAUSED"
                      ? "bg-amber-500/10 text-amber-400"
                      : task.status === "COMPLETED"
                      ? "bg-blue-500/10 text-blue-400"
                      : task.status === "PENDING_REVIEW"
                      ? "bg-indigo-500/10 text-indigo-300"
                      : "bg-red-500/10 text-red-400"
                  }`}>
                    {task.status === "PENDING_REVIEW" ? "PENDING REVIEW" : task.status}
                  </span>
                </div>

                {/* Title & Description */}
                <Link href={`/admin/tasks/${task.id}`} className="group">
                  <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">
                    {task.title}
                  </h3>
                </Link>
                <p className="text-[10px] font-mono text-gray-600 mt-1">
                  {taskDisplayId(task.id)}
                </p>
                <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                  {task.description}
                </p>

                {/* Rewards */}
                <div className="flex items-center gap-4 mt-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-indigo-400" />
                    <span className="text-white">{task.pointsReward.toLocaleString()}</span>
                    <span className="text-gray-500">pts</span>
                  </div>
                  {task.xpReward > 0 && (
                    <div className="flex items-center gap-1">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span className="text-white">{task.xpReward}</span>
                      <span className="text-gray-500">XP</span>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800 text-sm text-gray-400">
                  <span>{task._count.submissions} submissions</span>
                  <span>{task.completedCount} completed</span>
                </div>

                {/* Pending review — creator-funded task awaiting approval */}
                {task.status === "PENDING_REVIEW" && (
                  <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">Creator</p>
                        <p className="text-slate-300 font-mono truncate">
                          {task.createdById ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Completions</p>
                        <p className="text-slate-300">{task.totalLimit ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Budget</p>
                        <p className="text-slate-300">
                          {task.budgetPoints.toLocaleString()} pts
                        </p>
                      </div>
                    </div>
                    {canCreate && <TaskReviewActions taskId={task.id} />}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-gray-500">
                    Created {formatDistanceToNow(task.createdAt, { addSuffix: true })}
                  </span>
                  <TaskActions
                    task={{
                      id: task.id,
                      title: task.title,
                      status: task.status,
                    }}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    canCreate={canCreate}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-16 text-center">
          <ListTodo className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-medium text-white mb-2">No tasks found</h3>
          <p className="text-gray-400">
            {params.search || params.status || params.type
              ? "Try adjusting your filters"
              : "Create your first task to get started"}
          </p>
          {canCreate && !params.search && !params.status && !params.type && (
            <Link
              href="/admin/tasks/new"
              className="inline-flex items-center gap-2 px-4 py-2 mt-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Task
            </Link>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {skip + 1} - {Math.min(skip + pageSize, totalCount)} of {totalCount} tasks
          </p>
          <div className="flex gap-2">
            <Link
              href={page > 1 ? `/admin/tasks?${buildQueryString(page - 1)}` : "#"}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                page > 1
                  ? "bg-gray-800 text-white hover:bg-gray-700"
                  : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Link>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                return (
                  <Link
                    key={pageNum}
                    href={`/admin/tasks?${buildQueryString(pageNum)}`}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      pageNum === page
                        ? "bg-red-500 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                    }`}
                  >
                    {pageNum}
                  </Link>
                );
              })}
            </div>
            <Link
              href={page < totalPages ? `/admin/tasks?${buildQueryString(page + 1)}` : "#"}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                page < totalPages
                  ? "bg-gray-800 text-white hover:bg-gray-700"
                  : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
              }`}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
