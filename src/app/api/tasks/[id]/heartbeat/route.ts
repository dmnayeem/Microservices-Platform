import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubmissionStatus } from "@/generated/prisma";
import type { VideoConfig } from "@/lib/video-tasks";
import { socialWatchTargetSeconds } from "@/lib/social-tasks";

// Client sends a beat every ~5s while the video is genuinely playing AND the
// tab is visible/focused. The server — not the client — decides how many
// seconds to credit: it measures the real wall-clock gap since the last beat
// and clamps it to BEAT_MAX_STEP. A client can't inflate its watch count by
// sending a big number (there is none to send) or by beating faster than real
// time (each beat is capped and gated on the server clock).
const BEAT_INTERVAL_SECONDS = 5;
// Real gap allowed per beat = expected interval + slack for jitter/latency.
// Anything larger (tab was frozen, laptop slept, beats were withheld) is
// clamped so only continuous, foreground playback accrues time.
const BEAT_MAX_STEP = BEAT_INTERVAL_SECONDS + 3;

// POST /api/tasks/:id/heartbeat — accrue server-authoritative watched seconds
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const submissionId = String(body?.submissionId ?? "");
    if (!submissionId) {
      return NextResponse.json(
        { error: "submissionId is required" },
        { status: 400 }
      );
    }

    // Only a still-PENDING submission owned by this user can accrue time.
    const submission = await prisma.taskSubmission.findFirst({
      where: {
        id: submissionId,
        taskId: id,
        userId: session.user.id,
        status: SubmissionStatus.PENDING,
      },
      select: {
        id: true,
        watchedSeconds: true,
        lastBeatAt: true,
        createdAt: true,
      },
    });
    if (!submission) {
      return NextResponse.json(
        { error: "No active submission to track." },
        { status: 400 }
      );
    }

    // The watch target caps how much we ever store — no point accruing beyond
    // what the task requires.
    const task = await prisma.task.findUnique({
      where: { id },
      select: { type: true, videoConfig: true, socialConfig: true, duration: true },
    });
    // SOCIAL bundles accrue toward the sum of their locked watch items; VIDEO
    // (and other timed types) toward videoConfig.watchSeconds / duration.
    const watchTarget =
      task?.type === "SOCIAL"
        ? socialWatchTargetSeconds(task.socialConfig)
        : ((task?.videoConfig as VideoConfig | null)?.watchSeconds ??
          task?.duration ??
          0);

    // Server-clock gap since the previous beat, clamped to a single interval.
    // The FIRST beat (no prior lastBeatAt) credits nothing — it just anchors
    // the clock at real playback start. This prevents crediting the idle gap
    // between /start and first play (warmup, buffering, sitting on the page),
    // so accrued time reflects only actual foreground playback between beats.
    const now = Date.now();
    const step =
      submission.lastBeatAt === null
        ? 0
        : Math.max(
            0,
            Math.min(
              Math.floor((now - submission.lastBeatAt.getTime()) / 1000),
              BEAT_MAX_STEP
            )
          );

    let next = submission.watchedSeconds + step;
    if (watchTarget > 0) next = Math.min(next, watchTarget);

    const updated = await prisma.taskSubmission.update({
      where: { id: submission.id },
      data: { watchedSeconds: next, lastBeatAt: new Date(now) },
      select: { watchedSeconds: true },
    });

    return NextResponse.json({
      watchedSeconds: updated.watchedSeconds,
      watchTarget,
      done: watchTarget > 0 && updated.watchedSeconds >= watchTarget,
    });
  } catch (error) {
    console.error("Error recording watch heartbeat:", error);
    return NextResponse.json(
      { error: "Failed to record heartbeat" },
      { status: 500 }
    );
  }
}
