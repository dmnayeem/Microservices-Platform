import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { generateDemoAds, removeDemoAds } from "@/lib/ad-demo";

/** POST — generate one labeled demo ad for every ad space (idempotent). */
export async function POST() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await generateDemoAds(prisma);
  return NextResponse.json(result);
}

/** DELETE — remove all demo ads (deletes the demo campaign; cascades). */
export async function DELETE() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await removeDemoAds(prisma);
  return NextResponse.json(result);
}
