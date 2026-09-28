import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubmissionStatus } from "@/generated/prisma";

// POST /api/tasks/:id/progress — save PARTIAL progress for a multi-step task
// (currently SOCIAL bundles) onto the still-PENDING submission's metadata, so
// a reload / leaving the page resumes instead of restarting. Last-write-wins:
// the client sends the full current per-action state and we store it verbatim.
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
    const items = Array.isArray(body?.items) ? body.items : null;
    if (!submissionId || !items) {
      return NextResponse.json(
        { error: "submissionId and items are required" },
        { status: 400 }
      );
    }

    // Only a still-PENDING submission owned by this user can accrue progress.
    const submission = await prisma.taskSubmission.findFirst({
      where: {
        id: submissionId,
        taskId: id,
        userId: session.user.id,
        status: SubmissionStatus.PENDING,
        // Not yet handed in: once submitted the row is under review and its
        // proof/progress must not change.
        submittedAt: null,
      },
      select: { id: true, metadata: true },
    });
    if (!submission) {
      return NextResponse.json(
        { error: "No active submission to save progress to." },
        { status: 400 }
      );
    }

    const prevMeta =
      submission.metadata && typeof submission.metadata === "object"
        ? (submission.metadata as Record<string, unknown>)
        : {};

    await prisma.taskSubmission.update({
      where: { id: submission.id },
      data: {
        metadata: JSON.parse(
          JSON.stringify({ ...prevMeta, items, progressAt: Date.now() })
        ),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving task progress:", error);
    return NextResponse.json(
      { error: "Failed to save progress" },
      { status: 500 }
    );
  }
}
