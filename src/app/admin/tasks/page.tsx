import { parsePage } from "@/lib/paginate";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
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
  UserRound,
  History,
  Archive,
  LayoutGrid,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
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

/**
 * The status tabs, in the order an admin works through them: what is live,
 * what they stopped, what is unfinished, what is done, and what was retired.
 *
 * ARCHIVED is here because it had no entry point at all. It is where a task
 * goes instead of being deleted — its submissions are the record of work users
 * were paid for — so those tasks existed with no way to look at them.
 */
const STATUS_TABS = [
  { value: "all", label: "All", Icon: LayoutGrid, iconCls: "text-slate-400", activeCls: "border-slate-500 bg-slate-700" },
  { value: "ACTIVE", label: "Active", Icon: CheckCircle, iconCls: "text-emerald-400", activeCls: "border-emerald-500 bg-emerald-600" },
  { value: "PAUSED", label: "Paused", Icon: Pause, iconCls: "text-amber-400", activeCls: "border-amber-500 bg-amber-600" },
  { value: "DRAFT", label: "Draft", Icon: FileText, iconCls: "text-slate-400", activeCls: "border-slate-500 bg-slate-600" },
  { value: "COMPLETED", label: "Completed", Icon: ListTodo, iconCls: "text-blue-400", activeCls: "border-blue-500 bg-blue-600" },
  { value: "EXPIRED", label: "Expired", Icon: Clock, iconCls: "text-orange-400", activeCls: "border-orange-500 bg-orange-600" },
  { value: "ARCHIVED", label: "Archived", Icon: Archive, iconCls: "text-rose-400", activeCls: "border-rose-500 bg-rose-600" },
] as const;

export default async function AdminTasksPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!(await can(session.user.id, "tasks.view"))) {
    redirect("/admin");
  }

  const params = await searchParams;

  /**
   * A tab link that keeps every other filter.
   *
   * The old stat-card links were bare `/admin/tasks?status=X`, so switching
   * status silently dropped the type, board and search an admin had just set.
   * Page resets, though — page 4 of Active is not page 4 of Draft.
   */
  const tabHref = (status: string) => {
    const q = new URLSearchParams();
    if (status !== "all") q.set("status", status);
    if (params.type) q.set("type", params.type);
    if (params.difficulty) q.set("difficulty", params.difficulty);
    if (params.board) q.set("board", params.board);
    if (params.search) q.set("search", params.search);
    const qs = q.toString();
    return qs ? `/admin/tasks?${qs}` : "/admin/tasks";
  };
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
    archivedCount,
    expiredCount,
    allCount,
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
    prisma.task.count({ where: { status: "ARCHIVED" } }),
    prisma.task.count({ where: { status: "EXPIRED" } }),
    // "All" needs its own count: `totalCount` is the count of the CURRENT
    // filter, so it would read as whatever tab is open.
    prisma.task.count(),
    prisma.taskSubmission.count({ where: { status: "PENDING" } }),
    prisma.task.count({ where: { status: "PENDING_REVIEW" } }),
  ]);

  const boards = await prisma.taskBoard.findMany({
    orderBy: { order: "asc" },
    select: { id: true, title: true },
  });

  // Plans, so approving a buyer's task can say WHICH members will see it in
  // plan names rather than raw access-level integers. Task visibility is
  // `requiredAccessLevel <= the viewer's plan accessLevel`, and asking an admin
  // to remember that "2" means Gold is how the control goes unused.
  const plans = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: { accessLevel: "asc" },
    select: { id: true, name: true, accessLevel: true },
  });
  // One entry per distinct tier: several plans can share an accessLevel, and
  // offering the same choice three times helps nobody.
  const audienceTiers = [
    ...new Map(
      plans.map((p) => [
        p.accessLevel,
        {
          accessLevel: p.accessLevel,
          label: plans
            .filter((x) => x.accessLevel === p.accessLevel)
            .map((x) => x.name)
            .join(" / "),
        },
      ])
    ).values(),
  ];

  // Who made each task on this page, by name.
  //
  // `Task.createdById` is a bare string with no relation, so the card was
  // printing a raw cuid — technically the answer, practically unreadable. One
  // lookup for the whole page resolves them, the same way the admin activity
  // feed resolves its actors. `role` comes along because a task created by a
  // normal user (self-serve) is a different thing from one an admin made, and
  // the card should not make them look alike.
  const creatorIds = [
    ...new Set(tasksRaw.map((t) => t.createdById).filter(Boolean)),
  ] as string[];
  const creators = creatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, name: true, email: true, role: true },
      })
    : [];
  const creatorMap = new Map(
    creators.map((c) => [c.id, { name: c.name || c.email, role: c.role }])
  );

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

  const canCreate = await can(session.user.id, "tasks.create");
  const canEdit = await can(session.user.id, "tasks.edit");
  const canDelete = await can(session.user.id, "tasks.delete");

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
          {/* A deleted task leaves no card behind, so the only way to reach the
              record of it is a link that does not depend on the task existing. */}
          <Link
            href="/admin/tasks/removed"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-200 rounded-lg hover:bg-gray-700 transition-colors"
            title="Tasks that were archived or deleted, and who did it"
          >
            <History className="w-4 h-4" />
            Removed
          </Link>
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

      {/* Status tabs.
        *
        * These four numbers used to be stat cards that happened to be links,
        * which is two problems at once: they read as a dashboard rather than
        * as the control they were, and clicking one threw away whatever type,
        * board or search filter was already applied — so narrowing a list and
        * then switching status started over.
        *
        * One row of tabs instead, carrying the same counts. It adds the two
        * that were missing and that an admin genuinely needs: Archived, which
        * had no way in at all despite being where retired tasks live, and All,
        * which had no way back.
        */}
      <div
        role="tablist"
        aria-label="Filter tasks by status"
        className="flex flex-wrap items-center gap-1.5"
      >
        {STATUS_TABS.map((t) => {
          const current =
            (params.status ?? "all").toUpperCase() === t.value.toUpperCase();
          const count =
            t.value === "all"
              ? allCount
              : t.value === "ACTIVE"
                ? activeCount
                : t.value === "PAUSED"
                  ? pausedCount
                  : t.value === "DRAFT"
                    ? draftCount
                    : t.value === "COMPLETED"
                      ? completedCount
                      : t.value === "EXPIRED"
                        ? expiredCount
                        : archivedCount;
          return (
            <Link
              key={t.value}
              href={tabHref(t.value)}
              role="tab"
              aria-selected={current}
              aria-current={current ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                current
                  ? `${t.activeCls} text-white`
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              <t.Icon className={`w-4 h-4 shrink-0 ${current ? "" : t.iconCls}`} />
              {t.label}
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                  current ? "bg-white/15" : "bg-slate-800 text-slate-400"
                }`}
              >
                {count.toLocaleString()}
              </span>
            </Link>
          );
        })}
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
          <option value="QUIZ">Quiz Task</option>
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

                {/* Who made it. Shown on every task, not just the ones awaiting
                    review — "which admin created this" is a question asked of
                    ordinary tasks, and it was unanswerable from here. */}
                {(() => {
                  const c = task.createdById
                    ? creatorMap.get(task.createdById)
                    : null;
                  const isStaff = !!c && c.role !== "USER";
                  return (
                    <p className="text-[11px] text-gray-500 mt-2 flex items-center gap-1.5 flex-wrap">
                      <UserRound className="w-3 h-3 shrink-0" />
                      <span>Created by</span>
                      {c ? (
                        <>
                          <Link
                            href={`/admin/users/${task.createdById}`}
                            className="text-gray-300 hover:text-indigo-400 font-medium"
                          >
                            {c.name}
                          </Link>
                          <span
                            className={
                              isStaff
                                ? "px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-semibold"
                                : "px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] font-semibold"
                            }
                          >
                            {isStaff ? c.role.replace(/_/g, " ") : "USER"}
                          </span>
                        </>
                      ) : (
                        // Tasks that predate `createdById` being written, and
                        // seeded rows. Saying so is better than an empty dash
                        // that reads like a loading failure.
                        <span className="text-gray-600">
                          not recorded (created before this was tracked)
                        </span>
                      )}
                    </p>
                  );
                })()}

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
                        <p className="text-slate-300 truncate">
                          {(task.createdById &&
                            creatorMap.get(task.createdById)?.name) ??
                            "—"}
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
                    {canCreate && (
                      <TaskReviewActions
                        taskId={task.id}
                        tiers={audienceTiers}
                        currentAccessLevel={task.requiredAccessLevel}
                      />
                    )}
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
