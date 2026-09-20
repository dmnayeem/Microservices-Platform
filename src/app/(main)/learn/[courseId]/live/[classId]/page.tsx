import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Video } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LiveClassRoom } from "@/components/courses/live-class-room";

export default async function LiveClassPage({
  params,
}: {
  params: Promise<{ courseId: string; classId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { courseId, classId } = await params;

  const liveClass = await prisma.courseLiveClass.findUnique({
    where: { id: classId },
    include: { course: { select: { id: true, title: true } } },
  });
  if (!liveClass || liveClass.courseId !== courseId) notFound();

  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { courseId_userId: { courseId, userId: session.user.id } },
    select: { id: true },
  });

  if (!enrollment) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-3">
        <Lock className="w-10 h-10 text-(--app-ink-3) mx-auto" />
        <p className="text-white font-semibold">Enrol to join this live class</p>
        <Link
          href={`/courses`}
          className="inline-flex text-sm text-(--app-accent-ink) hover:text-(--app-accent-ink)"
        >
          Browse courses
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Link
        href={`/learn/${courseId}`}
        className="inline-flex items-center gap-1 text-xs text-(--app-ink-3) hover:text-white"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to course
      </Link>
      <div className="flex items-center gap-2">
        <Video className="w-5 h-5 text-(--app-accent-ink)" />
        <h1 className="text-lg font-bold text-white">{liveClass.title}</h1>
      </div>
      <LiveClassRoom meetingUrl={liveClass.meetingUrl} title={liveClass.title} />
      {liveClass.meetingPassword && (
        <p className="text-sm text-(--app-ink-3)">
          Room password: <span className="font-mono text-white">{liveClass.meetingPassword}</span>
        </p>
      )}
      {liveClass.recordingUrl && (
        <a
          href={liveClass.recordingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex text-sm text-(--app-accent-ink) hover:text-(--app-accent-ink)"
        >
          Watch recording
        </a>
      )}
    </div>
  );
}
