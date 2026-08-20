import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { taskRunHref } from "@/lib/task-routes";

interface SearchResult {
  id: string;
  type: "TASK" | "USER" | "COURSE" | "LISTING";
  title: string;
  subtitle?: string;
  imageUrl?: string;
  href: string;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Four parallel `contains` scans per call. Even with the new trigram indexes
  // this is the most expensive read a single account can issue on demand.
  const limited = await enforceDbRateLimit(
    request,
    "search",
    session.user.id,
    60,
    60_000
  );
  if (limited) return limited;
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const scope = (searchParams.get("scope") ?? "all").toLowerCase();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results: SearchResult[] = [];
  const limit = 8;
  const wantAll = scope === "all";

  if (wantAll || scope === "tasks") {
    const tasks = await prisma.task.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, title: true, type: true, thumbnailUrl: true },
      take: limit,
    });
    for (const t of tasks) {
      results.push({
        id: t.id,
        type: "TASK",
        title: t.title,
        subtitle: t.type,
        imageUrl: t.thumbnailUrl ?? undefined,
        href: taskRunHref(t.type, t.id),
      });
    }
  }

  if (wantAll || scope === "users") {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
        ],
        status: "ACTIVE",
      },
      select: { id: true, name: true, username: true, avatar: true },
      take: limit,
    });
    for (const u of users) {
      results.push({
        id: u.id,
        type: "USER",
        title: u.name ?? u.username ?? "User",
        subtitle: u.username ? `@${u.username}` : undefined,
        imageUrl: u.avatar ?? undefined,
        href: `/profile/${u.id}`,
      });
    }
  }

  if (wantAll || scope === "courses") {
    const courses = await prisma.course.findMany({
      where: {
        status: "PUBLISHED",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, title: true, category: true, thumbnail: true },
      take: limit,
    });
    for (const c of courses) {
      results.push({
        id: c.id,
        type: "COURSE",
        title: c.title,
        subtitle: c.category,
        imageUrl: c.thumbnail ?? undefined,
        href: `/courses/${c.id}`,
      });
    }
  }

  if (wantAll || scope === "market") {
    const listings = await prisma.marketplaceListing.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        category: true,
        price: true,
        images: true,
      },
      take: limit,
    });
    for (const l of listings) {
      results.push({
        id: l.id,
        type: "LISTING",
        title: l.title,
        subtitle: `${l.category} · ${usd(l.price)}`,
        imageUrl: l.images[0] ?? undefined,
        href: `/marketplace/${l.id}`,
      });
    }
  }

  return NextResponse.json({ results });
}
