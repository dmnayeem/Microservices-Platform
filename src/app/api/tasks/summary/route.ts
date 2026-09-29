import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeTaskSummary } from "@/lib/tasks-summary";

// GET /api/tasks/summary — per-task-type daily aggregates for the category grid
// on /tasks. The /tasks page renders the first copy on the server with the same
// function; this route serves the client's later refreshes.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Super-admin page visibility: refuse when /tasks is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/tasks");
  if (pageHidden) return pageHidden;

  try {
    const data = await computeTaskSummary(session.user.id);
    return NextResponse.json(data ?? { summary: {} });
  } catch (error) {
    console.error("tasks summary failed:", error);
    return NextResponse.json({ summary: {} });
  }
}
