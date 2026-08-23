import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { gameCategorySchema, slugify } from "@/lib/games-admin";

export async function GET() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "games.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const categories = await prisma.gameCategory.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { games: true } } },
  });
  return NextResponse.json({ categories });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const v = gameCategorySchema.safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const slug = v.data.slug || slugify(v.data.name);
  if (!slug) {
    return NextResponse.json(
      { error: "That name doesn't produce a usable slug — use letters or numbers." },
      { status: 400 }
    );
  }

  const clash = await prisma.gameCategory.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: `"${clash.name}" already uses that slug.` },
      { status: 409 }
    );
  }

  const category = await prisma.gameCategory.create({
    data: { ...v.data, slug },
  });
  return NextResponse.json({ success: true, category }, { status: 201 });
}
