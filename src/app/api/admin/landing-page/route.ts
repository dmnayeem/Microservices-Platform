import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getLandingContent } from "@/lib/landing-content-server";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "landing.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const content = await getLandingContent();
  return NextResponse.json({ content });
}
