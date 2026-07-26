import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { ChevronLeft, Megaphone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AnnouncementComposer } from "./_components/AnnouncementComposer";

export default async function TutorCourseAnnouncementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      tutorId: true,
      enrollmentCount: true,
    },
  });
  if (!course) notFound();
  if (course.tutorId !== session.user.id) redirect("/tutor/courses");

  const announcementsRaw = await prisma.courseAnnouncement.findMany({
    where: { courseId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { author: { select: { id: true, name: true, avatar: true } } },
  });
  const announcements = announcementsRaw as unknown as Array<{
    id: string;
    title: string;
    body: string;
    createdAt: Date;
    author: { id: string; name: string | null; avatar: string | null };
  }>;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/tutor/courses/${id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to course
        </Link>
        <h1 className="text-2xl font-bold text-white mt-1 inline-flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-amber-300" />
          Announcements
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Post updates to every enrolled student. They&apos;ll get an in-app
          notification.
        </p>
      </div>

      <AnnouncementComposer courseId={id} enrolledCount={course.enrollmentCount} />

      {announcements.length === 0 ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-10 text-center">
          <Megaphone className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-white font-bold">No announcements yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Send your first announcement — welcome new students or share an update.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="bg-slate-900 rounded-xl border border-slate-800 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {a.author.avatar ? (
                    <SmartImage
                      src={a.author.avatar}
                      alt=""
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-full object-cover bg-slate-800"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white">
                      {(a.author.name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm font-bold text-white">{a.author.name ?? "—"}</p>
                </div>
                <p className="text-[11px] text-slate-500">
                  {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                </p>
              </div>
              <h3 className="text-base font-bold text-white mt-3">{a.title}</h3>
              <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">
                {a.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
