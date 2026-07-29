import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BookOpen, Plus, Star, Users, Edit3 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { PromoteButton } from "@/components/user/promotion/promote-button";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function TutorCoursesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { status } = await searchParams;

  const where: Record<string, unknown> = { tutorId: session.user.id };
  if (status) where.status = status;

  const [coursesRaw, statusCounts] = await Promise.all([
    prisma.course.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { lessons: true, enrollments: true, reviews: true } },
      },
    }),
    prisma.course.groupBy({
      by: ["status"],
      where: { tutorId: session.user.id },
      _count: { _all: true },
    }),
  ]);

  const courses = coursesRaw as unknown as Array<{
    id: string;
    title: string;
    subtitle: string | null;
    status: string;
    thumbnail: string | null;
    enrollmentCount: number;
    avgRating: number;
    isFree: boolean;
    price: number;
    updatedAt: Date;
    featuredUntil: Date | null;
    _count: { lessons: number; enrollments: number; reviews: number };
  }>;

  const counts: Record<string, number> = {
    DRAFT: 0,
    PENDING_REVIEW: 0,
    PUBLISHED: 0,
    SUSPENDED: 0,
    ARCHIVED: 0,
  };
  for (const c of statusCounts as Array<{ status: string; _count: { _all: number } }>) {
    counts[c.status] = c._count._all;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-300" />
            My courses
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Everything you&apos;ve created. Draft new content, submit it for review,
            or update what&apos;s live.
          </p>
        </div>
        <Link
          href="/tutor/courses/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
        >
          <Plus className="w-4 h-4" />
          New course
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <FilterPill href="/tutor/courses" label="All" count={total} active={!status} />
        <FilterPill
          href="/tutor/courses?status=DRAFT"
          label="Drafts"
          count={counts.DRAFT}
          active={status === "DRAFT"}
          tone="slate"
        />
        <FilterPill
          href="/tutor/courses?status=PENDING_REVIEW"
          label="In review"
          count={counts.PENDING_REVIEW}
          active={status === "PENDING_REVIEW"}
          tone="amber"
        />
        <FilterPill
          href="/tutor/courses?status=PUBLISHED"
          label="Live"
          count={counts.PUBLISHED}
          active={status === "PUBLISHED"}
          tone="emerald"
        />
        <FilterPill
          href="/tutor/courses?status=SUSPENDED"
          label="Suspended"
          count={counts.SUSPENDED}
          active={status === "SUSPENDED"}
          tone="rose"
        />
        <FilterPill
          href="/tutor/courses?status=ARCHIVED"
          label="Archived"
          count={counts.ARCHIVED}
          active={status === "ARCHIVED"}
          tone="slate"
        />
      </div>

      {courses.length === 0 ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-800 mx-auto flex items-center justify-center text-slate-500 mb-3">
            <BookOpen className="w-6 h-6" />
          </div>
          <p className="text-white font-bold">No courses here yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Build your first course — it should take 15 minutes.
          </p>
          <Link
            href="/tutor/courses/new"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm"
          >
            <Plus className="w-4 h-4" />
            New course
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {courses.map((c) => (
            <div key={c.id} className="space-y-1.5">
              <CourseCard c={c} />
              {c.status === "PUBLISHED" && (
                <div className="px-1">
                  <PromoteButton
                    kind="course"
                    id={c.id}
                    featuredUntil={c.featuredUntil?.toISOString() ?? null}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({
  c,
}: {
  c: {
    id: string;
    title: string;
    subtitle: string | null;
    status: string;
    thumbnail: string | null;
    enrollmentCount: number;
    avgRating: number;
    isFree: boolean;
    price: number;
    updatedAt: Date;
    _count: { lessons: number; enrollments: number; reviews: number };
  };
}) {
  return (
    <Link
      href={`/tutor/courses/${c.id}`}
      className="bg-slate-900 rounded-xl border border-slate-800 hover:border-indigo-500/40 transition-colors overflow-hidden group"
    >
      <div className="aspect-video bg-slate-950 relative">
        {c.thumbnail ? (
          <Image
            src={c.thumbnail}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-700">
            <BookOpen className="w-10 h-10" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <StatusPill status={c.status} />
        </div>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-sm font-bold text-white line-clamp-2 group-hover:text-indigo-200">
          {c.title}
        </p>
        {c.subtitle && (
          <p className="text-xs text-slate-400 line-clamp-2">{c.subtitle}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {c.enrollmentCount}
          </span>
          {c.avgRating > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
              {c.avgRating.toFixed(1)}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1">
            <Edit3 className="w-3 h-3" />
            {formatDistanceToNow(c.updatedAt, { addSuffix: true })}
          </span>
        </div>
        <p className="text-xs font-bold text-emerald-300">
          {c.isFree ? "Free" : `$${c.price.toFixed(2)}`}
        </p>
      </div>
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: "Draft", cls: "bg-slate-700 text-slate-200" },
    PENDING_REVIEW: { label: "In review", cls: "bg-amber-500 text-amber-950" },
    PUBLISHED: { label: "Live", cls: "bg-emerald-500 text-emerald-950" },
    SUSPENDED: { label: "Suspended", cls: "bg-rose-500 text-white" },
    ARCHIVED: { label: "Archived", cls: "bg-slate-600 text-slate-200" },
  };
  const c = cfg[status] ?? cfg.DRAFT;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  );
}

function FilterPill({
  href,
  label,
  count,
  active,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  tone?: "amber" | "emerald" | "rose" | "slate";
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-300"
      : tone === "emerald"
      ? "text-emerald-300"
      : tone === "rose"
      ? "text-rose-300"
      : "text-slate-300";
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold border " +
        (active
          ? "border-indigo-500 bg-indigo-500/20 text-white"
          : `border-slate-700 bg-slate-900 hover:bg-slate-800 ${toneCls}`)
      }
    >
      {label}
      <span className="ml-1 text-slate-500 tabular-nums">{count}</span>
    </Link>
  );
}
