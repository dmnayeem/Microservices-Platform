import { assertPageVisible } from "@/lib/page-visibility-server";
import { taskTypePage } from "@/lib/page-visibility";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TaskType } from "@/generated/prisma";
import { listTasksForUser } from "@/lib/task-list";

// GET /api/tasks - Fetch available tasks for user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as TaskType | null;
    // Super-admin page visibility: a typed list for a hidden task page refuses.
    const pageHidden = await assertPageVisible(session.user.id, taskTypePage(type));
    if (pageHidden) return pageHidden;
    const category = searchParams.get("category");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100);

    // The body lives in lib/task-list.ts so /earn can render its first page
    // on the server with the same code.
    const result = await listTasksForUser(session.user.id, { type, category, page, limit });
    if (!result) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
