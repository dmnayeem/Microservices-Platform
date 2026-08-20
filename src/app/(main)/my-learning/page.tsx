import { usd } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  GraduationCap,
  Award,
  Heart,
  Brain,
  ClipboardList,
  CheckCircle2,
  PlayCircle,
  Clock,
} from "lucide-react";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { StatCard } from "@/components/user/primitives/stat-card";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { MyLearningTabs } from "./MyLearningTabs";

const TABS = [
  { id: "in-progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "wishlist", label: "Wishlist" },
  { id: "certificates", label: "Certificates" },
  { id: "quizzes", label: "Quiz results" },
  { id: "assignments", label: "Assignments" },
] as const;
type TabId = (typeof TABS)[number]["id"];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function MyLearningPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { tab } = await searchParams;
  const active: TabId =
    (TABS.find((t) => t.id === tab)?.id as TabId) ?? "in-progress";

  // Pull everything in parallel — small lists; cheap enough.
  const [
    enrollmentsRaw,
    bookmarksRaw,
    certificatesRaw,
    quizAttemptsRaw,
    assignmentSubsRaw,
  ] = await Promise.all([
    prisma.courseEnrollment.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            thumbnail: true,
            totalLessons: true,
            totalDuration: true,
            avgRating: true,
            tutor: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.courseBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            thumbnail: true,
            isFree: true,
            price: true,
            discountPrice: true,
            avgRating: true,
            enrollmentCount: true,
          },
        },
      },
    }),
    prisma.courseCertificate.findMany({
      where: { userId },
      orderBy: { issuedAt: "desc" },
      include: {
        course: {
          select: { id: true, slug: true, title: true, thumbnail: true },
        },
      },
    }),
    prisma.courseQuizAttempt.findMany({
      where: { userId },
      orderBy: { submittedAt: "desc" },
      take: 50,
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            course: { select: { id: true, slug: true, title: true } },
          },
        },
      },
    }),
    prisma.courseAssignmentSubmission.findMany({
      where: { userId },
      orderBy: { submittedAt: "desc" },
      take: 50,
      include: {
        assignment: {
          select: {
            id: true,
            title: true,
            maxMarks: true,
            course: { select: { id: true, slug: true, title: true } },
          },
        },
      },
    }),
  ]);

  // Type-assertions for Accelerate
  const enrollments = enrollmentsRaw as unknown as Array<{
    id: string;
    progress: number;
    completedAt: Date | null;
    updatedAt: Date;
    course: {
      id: string;
      slug: string | null;
      title: string;
      thumbnail: string | null;
      totalLessons: number;
      totalDuration: number;
      avgRating: number;
      tutor: { id: string; name: string | null } | null;
    };
  }>;
  const bookmarks = bookmarksRaw as unknown as Array<{
    id: string;
    createdAt: Date;
    course: {
      id: string;
      slug: string | null;
      title: string;
      thumbnail: string | null;
      isFree: boolean;
      price: number;
      discountPrice: number | null;
      avgRating: number;
      enrollmentCount: number;
    };
  }>;
  const certificates = certificatesRaw as unknown as Array<{
    id: string;
    serial: string;
    sharedUrl: string;
    issuedAt: Date;
    course: {
      id: string;
      slug: string | null;
      title: string;
      thumbnail: string | null;
    };
  }>;
  const quizAttempts = quizAttemptsRaw as unknown as Array<{
    id: string;
    score: number;
    passed: boolean;
    submittedAt: Date | null;
    quiz: {
      id: string;
      title: string;
      course: { id: string; slug: string | null; title: string };
    };
  }>;
  const assignmentSubs = assignmentSubsRaw as unknown as Array<{
    id: string;
    status: string;
    marks: number | null;
    submittedAt: Date;
    assignment: {
      id: string;
      title: string;
      maxMarks: number;
      course: { id: string; slug: string | null; title: string };
    };
  }>;

  const inProgress = enrollments.filter((e) => !e.completedAt);
  const completed = enrollments.filter((e) => !!e.completedAt);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-indigo-300" />
          My learning
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Pick up where you left off, manage your wishlist, and grab your
          certificates.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<PlayCircle className="w-5 h-5" />}
          tone="blue"
          label="In progress"
          value={inProgress.length}
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          tone="green"
          label="Completed"
          value={completed.length}
        />
        <StatCard
          icon={<Award className="w-5 h-5" />}
          tone="amber"
          label="Certificates"
          value={certificates.length}
        />
        <StatCard
          icon={<Heart className="w-5 h-5" />}
          tone="pink"
          label="Wishlist"
          value={bookmarks.length}
        />
      </div>

      {/* Tabs */}
      <MyLearningTabs
        active={active}
        options={TABS.map((t) => ({ value: t.id, label: t.label }))}
      />

      {/* Panels */}
      {active === "in-progress" && (
        <EnrollmentList items={inProgress} emptyHint="Enrol in a course to see it here." />
      )}
      {active === "completed" && (
        <EnrollmentList items={completed} emptyHint="Finish a course to see it here." />
      )}
      {active === "wishlist" && (
        <WishlistList items={bookmarks} />
      )}
      {active === "certificates" && (
        <CertificateList items={certificates} />
      )}
      {active === "quizzes" && (
        <QuizAttempts items={quizAttempts} />
      )}
      {active === "assignments" && (
        <AssignmentSubs items={assignmentSubs} />
      )}
    </div>
  );
}


function EnrollmentList({
  items,
  emptyHint,
}: {
  items: Array<{
    id: string;
    progress: number;
    completedAt: Date | null;
    updatedAt: Date;
    course: {
      id: string;
      slug: string | null;
      title: string;
      thumbnail: string | null;
      totalLessons: number;
      totalDuration: number;
      avgRating: number;
      tutor: { id: string; name: string | null } | null;
    };
  }>;
  emptyHint: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={PlayCircle}
        title="Nothing here yet"
        description={emptyHint}
      />
    );
  }
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {items.map((e) => (
        <li
          key={e.id}
          className="card card-interactive overflow-hidden group"
        >
          <Link href={`/learn/${e.course.id}`} className="block">
            <div className="aspect-video bg-gray-950 relative">
              {e.course.thumbnail ? (
                <Image
                  src={e.course.thumbnail}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-gray-700">
                  <GraduationCap className="w-10 h-10" />
                </div>
              )}
              {e.completedAt && (
                <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-500 text-emerald-950 text-[10px] font-bold">
                  Completed
                </span>
              )}
            </div>
            <div className="p-3 space-y-2">
              <p className="text-sm font-bold text-white line-clamp-2 group-hover:text-indigo-200">
                {e.course.title}
              </p>
              {e.course.tutor && (
                <p className="text-xs text-gray-500">
                  by {e.course.tutor.name ?? "Tutor"}
                </p>
              )}
              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                <Clock className="w-3 h-3" />
                {Math.round(e.course.totalDuration / 60)}h
                <span className="ml-auto">
                  Updated {formatDistanceToNow(e.updatedAt, { addSuffix: true })}
                </span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500"
                  style={{ width: `${Math.max(0, Math.min(100, e.progress))}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400 tabular-nums">
                {e.progress}% complete
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function WishlistList({
  items,
}: {
  items: Array<{
    course: {
      id: string;
      slug: string | null;
      title: string;
      thumbnail: string | null;
      isFree: boolean;
      price: number;
      discountPrice: number | null;
      avgRating: number;
      enrollmentCount: number;
    };
  }>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Your wishlist is empty"
        description="Tap the heart on any course to save it for later."
      />
    );
  }
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {items.map((b) => {
        const c = b.course;
        const live = c.discountPrice ?? c.price;
        return (
          <li
            key={c.id}
            className="card overflow-hidden group hover:border-rose-500/40!"
          >
            <Link href={`/courses/${c.slug ?? c.id}`} className="block">
              <div className="aspect-video bg-gray-950 relative">
                {c.thumbnail ? (
                  <Image
                    src={c.thumbnail}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-gray-700">
                    <GraduationCap className="w-10 h-10" />
                  </div>
                )}
              </div>
              <div className="p-3 space-y-2">
                <p className="text-sm font-bold text-white line-clamp-2">
                  {c.title}
                </p>
                <p className="text-sm font-extrabold text-white">
                  {c.isFree ? "Free" : `${usd(live)}`}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function CertificateList({
  items,
}: {
  items: Array<{
    id: string;
    serial: string;
    sharedUrl: string;
    issuedAt: Date;
    course: { id: string; slug: string | null; title: string; thumbnail: string | null };
  }>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title="No certificates yet"
        description="Finish a course (and pass every quiz) to earn one."
      />
    );
  }
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((c) => (
        <li
          key={c.id}
          className="bg-gradient-to-br from-amber-500/10 via-emerald-500/5 to-indigo-500/5 rounded-2xl border border-amber-500/30 p-5"
        >
          <div className="flex items-start gap-3">
            <Award className="w-10 h-10 text-amber-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-200 font-bold uppercase tracking-wider">
                Certificate of completion
              </p>
              <p className="text-base font-bold text-white mt-1 truncate">
                {c.course.title}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Issued {new Date(c.issuedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </p>
              <p className="text-[10px] text-gray-500 font-mono mt-2 truncate">
                #{c.serial}
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/certificates/${c.serial}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
                >
                  View certificate
                </Link>
                <Link
                  href={`/courses/${c.course.slug ?? c.course.id}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold"
                >
                  Back to course
                </Link>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function QuizAttempts({
  items,
}: {
  items: Array<{
    id: string;
    score: number;
    passed: boolean;
    submittedAt: Date | null;
    quiz: { id: string; title: string; course: { id: string; slug: string | null; title: string } };
  }>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState icon={Brain} title="No quizzes taken yet" />
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li
          key={a.id}
          className="card p-4 flex items-center gap-3"
        >
          <Brain
            className={`w-6 h-6 shrink-0 ${a.passed ? "text-emerald-300" : "text-rose-300"}`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{a.quiz.title}</p>
            <p className="text-xs text-gray-500 truncate">
              {a.quiz.course.title} ·{" "}
              {a.submittedAt
                ? formatDistanceToNow(a.submittedAt, { addSuffix: true })
                : "Not submitted"}
            </p>
          </div>
          <p
            className={
              "text-lg font-extrabold tabular-nums " +
              (a.passed ? "text-emerald-300" : "text-rose-300")
            }
          >
            {a.score.toFixed(0)}%
          </p>
        </li>
      ))}
    </ul>
  );
}

function AssignmentSubs({
  items,
}: {
  items: Array<{
    id: string;
    status: string;
    marks: number | null;
    submittedAt: Date;
    assignment: { id: string; title: string; maxMarks: number; course: { id: string; slug: string | null; title: string } };
  }>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState icon={ClipboardList} title="No assignments submitted yet" />
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((s) => (
        <li
          key={s.id}
          className="card p-4 flex items-center gap-3"
        >
          <ClipboardList className="w-6 h-6 text-amber-300 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">
              {s.assignment.title}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {s.assignment.course.title} ·{" "}
              {formatDistanceToNow(s.submittedAt, { addSuffix: true })}
            </p>
          </div>
          <div className="text-right">
            <StatusPill status={s.status} />
            {s.marks !== null && (
              <p className="text-sm font-bold text-white tabular-nums mt-1">
                {s.marks} / {s.assignment.maxMarks}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    PENDING: { label: "Pending", cls: "bg-amber-500/15 text-amber-300" },
    GRADED: { label: "Graded", cls: "bg-emerald-500/15 text-emerald-300" },
    RESUBMIT: { label: "Resubmit", cls: "bg-rose-500/15 text-rose-300" },
  };
  const c = cfg[status] ?? cfg.PENDING;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  );
}
