import { parsePage } from "@/lib/paginate";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Brain,
  Plus,
  Sparkles,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  Archive,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AdminTable } from "@/components/admin/ui/admin-table";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
  }>;
}

const STATUS_BADGES: Record<string, { color: string; label: string }> = {
  DRAFT: { color: "bg-slate-500/15 text-slate-300", label: "Draft" },
  PUBLISHED: { color: "bg-emerald-500/15 text-emerald-400", label: "Published" },
  ARCHIVED: { color: "bg-slate-700/40 text-slate-500", label: "Archived" },
};

const DIFFICULTY_BADGES: Record<string, string> = {
  EASY: "bg-emerald-500/10 text-emerald-400",
  MEDIUM: "bg-amber-500/10 text-amber-400",
  HARD: "bg-red-500/10 text-red-400",
};

export default async function QuizzesAdminPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "quizzes.view"))) redirect("/admin");

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const statusFilter = params.status || "";

  const where = statusFilter ? { status: statusFilter as never } : {};

  const [quizzesRaw, total, totalAll, draftCount, publishedCount, aiGenCount] =
    await Promise.all([
      prisma.quiz.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          _count: { select: { questions: true, attempts: true } },
        },
      }),
      prisma.quiz.count({ where }),
      prisma.quiz.count(),
      prisma.quiz.count({ where: { status: "DRAFT" } }),
      prisma.quiz.count({ where: { status: "PUBLISHED" } }),
      prisma.quiz.count({ where: { aiGenerated: true } }),
    ]);

  // The OTHER quiz system: Task rows of type QUIZ. Both used to be called
  // "Quizzes", so admin counting 9 Quiz rows while a user saw 12 quiz TASKS
  // looked like a bug. Surfacing both counts here makes the split obvious.
  const quizTaskCount = await prisma.task
    .count({ where: { type: "QUIZ" } })
    .catch(() => 0);

  type QuizRow = (typeof quizzesRaw)[0] & {
    _count: { questions: number; attempts: number };
  };
  const quizzes = quizzesRaw as QuizRow[];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canManage = await can(session.user.id, "quizzes.manage");

  const buildHref = (newPage: number, newStatus?: string) => {
    const sp = new URLSearchParams();
    sp.set("page", String(newPage));
    if (newStatus !== undefined) {
      if (newStatus) sp.set("status", newStatus);
    } else if (statusFilter) {
      sp.set("status", statusFilter);
    }
    return `/admin/quizzes?${sp.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-6 h-6 text-pink-400" />
            Quiz Games
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Standalone AI-powered quiz games. Quiz <b>tasks</b> are a separate
            system —{" "}
            <Link href="/admin/tasks?type=QUIZ" className="text-blue-400 hover:text-blue-300 underline">
              manage those under Tasks ({quizTaskCount})
            </Link>
            .
          </p>
        </div>
        {canManage && (
          <Link
            href="/admin/quizzes/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Quiz
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link
          href="/admin/quizzes"
          className={`rounded-xl border p-4 ${!statusFilter ? "border-blue-500/50 bg-blue-500/5" : "border-slate-800 bg-slate-900 hover:border-slate-700"}`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Brain className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalAll}</p>
              <p className="text-sm text-slate-500">All (incl. drafts)</p>
            </div>
          </div>
        </Link>
        <Link
          href="/admin/quizzes?status=PUBLISHED"
          className={`rounded-xl border p-4 ${statusFilter === "PUBLISHED" ? "border-emerald-500/50 bg-emerald-500/5" : "border-slate-800 bg-slate-900 hover:border-slate-700"}`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{publishedCount}</p>
              <p className="text-sm text-slate-500">Published</p>
            </div>
          </div>
        </Link>
        <Link
          href="/admin/quizzes?status=DRAFT"
          className={`rounded-xl border p-4 ${statusFilter === "DRAFT" ? "border-amber-500/50 bg-amber-500/5" : "border-slate-800 bg-slate-900 hover:border-slate-700"}`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{draftCount}</p>
              <p className="text-sm text-slate-500">Drafts</p>
            </div>
          </div>
        </Link>
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/15">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{aiGenCount}</p>
              <p className="text-sm text-slate-500">AI Generated</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 flex gap-1">
        <Link
          href="/admin/quizzes"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
            !statusFilter
              ? "border-blue-500 text-white"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          All ({totalAll})
        </Link>
        {(["PUBLISHED", "DRAFT", "ARCHIVED"] as const).map((s) => (
          <Link
            key={s}
            href={`/admin/quizzes?status=${s}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px capitalize ${
              statusFilter === s
                ? "border-blue-500 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {s.toLowerCase()}
          </Link>
        ))}
      </div>

      {/* List */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        {quizzes.length === 0 ? (
          <div className="p-16 text-center">
            <Brain className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-medium text-white mb-1">No quizzes yet</h3>
            <p className="text-sm text-slate-400 mb-4">
              Create one manually or use AI to generate a full quiz from a topic.
            </p>
            {canManage && (
              <Link
                href="/admin/quizzes/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Create First Quiz
              </Link>
            )}
          </div>
        ) : (
          <AdminTable
            bare
            rows={quizzes}
            getRowKey={(q) => q.id}
            columns={[
              {
                key: "quiz",
                header: "Quiz",
                primary: true,
                cell: (q) => (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate max-w-70">
                        {q.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDistanceToNow(q.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                    {q.aiGenerated && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 text-[10px] font-bold">
                        <Sparkles className="w-3 h-3" />
                        AI
                      </span>
                    )}
                  </div>
                ),
              },
              {
                key: "category",
                header: "Category",
                mobileHidden: true,
                cell: (q) => (
                  <span className="text-sm text-slate-300">{q.category}</span>
                ),
              },
              {
                key: "difficulty",
                header: "Difficulty",
                cell: (q) => (
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      DIFFICULTY_BADGES[q.difficulty] ?? "bg-slate-800"
                    }`}
                  >
                    {q.difficulty}
                  </span>
                ),
              },
              {
                key: "reward",
                header: "Reward",
                mobileHidden: true,
                cell: (q) => (
                  <span className="text-sm">
                    <span className="text-amber-400 font-bold tabular-nums">
                      {q.pointsReward.toLocaleString()}
                    </span>{" "}
                    <span className="text-slate-500">pts</span>
                  </span>
                ),
              },
              {
                key: "stats",
                header: "Stats",
                mobileHidden: true,
                cell: (q) => (
                  <span className="text-sm text-slate-400 tabular-nums">
                    {q._count.questions}q · {q._count.attempts} attempts
                  </span>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (q) => {
                  const statusCfg = STATUS_BADGES[q.status] ?? STATUS_BADGES.DRAFT;
                  return (
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${statusCfg.color}`}
                    >
                      {statusCfg.label}
                    </span>
                  );
                },
              },
              {
                key: "actions",
                header: "Actions",
                cell: (q) => (
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/admin/quizzes/${q.id}`}
                      className="p-1.5 rounded hover:bg-slate-700 text-blue-400"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    {canManage && (
                      <>
                        <Link
                          href={`/admin/quizzes/${q.id}/edit`}
                          className="p-1.5 rounded hover:bg-slate-700 text-emerald-400"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/admin/quizzes/${q.id}?archive=1`}
                          className="p-1.5 rounded hover:bg-slate-700 text-red-400"
                          title="Archive"
                        >
                          <Archive className="w-4 h-4" />
                        </Link>
                      </>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Showing {skip + 1}–{Math.min(skip + pageSize, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Link
                href={page > 1 ? buildHref(page - 1) : "#"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg ${
                  page > 1
                    ? "bg-slate-800 text-white hover:bg-slate-700"
                    : "bg-slate-800/50 text-slate-600 cursor-not-allowed"
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </Link>
              <Link
                href={page < totalPages ? buildHref(page + 1) : "#"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg ${
                  page < totalPages
                    ? "bg-slate-800 text-white hover:bg-slate-700"
                    : "bg-slate-800/50 text-slate-600 cursor-not-allowed"
                }`}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Trash icon kept as placeholder for archive bulk actions */}
      <Trash2 className="hidden" />
    </div>
  );
}
