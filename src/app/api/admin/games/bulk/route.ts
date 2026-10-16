import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  bulkGamesSchema,
  bulkRowError,
  gameConfigError,
  gameCreateSchema,
  matchGameCategory,
  slugify,
} from "@/lib/games-admin";

interface Problem {
  line: number;
  title: string;
  reason: string;
}

/**
 * Add many games in one go. Each row is judged by the SAME `gameCreateSchema`
 * and `gameConfigError` as the single "New game" form, so the two can't drift.
 * Rows whose game URL is already listed are skipped, not duplicated.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actorId = session.user.id;

  const v = bulkGamesSchema.safeParse(await request.json().catch(() => null));
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { rows, isActive, connected, pointsPer1000 } = v.data;
  if (connected && pointsPer1000 < 1) {
    return NextResponse.json(
      { error: "Set how many RevType points 1,000 game points are worth (at least 1)." },
      { status: 400 }
    );
  }

  const problems: Problem[] = [];
  const seen = new Set<string>();
  const parsed: {
    line: number;
    category: string;
    data: ReturnType<typeof gameCreateSchema.parse>;
  }[] = [];

  for (const raw of rows) {
    const r = {
      title: raw.title.trim(),
      embedUrl: raw.embedUrl.trim(),
      iconUrl: raw.iconUrl.trim(),
      category: raw.category.trim(),
    };
    const err = bulkRowError(r);
    if (err) {
      problems.push({ line: raw.line, title: r.title, reason: err });
      continue;
    }
    if (seen.has(r.embedUrl)) {
      problems.push({
        line: raw.line,
        title: r.title,
        reason: "This game URL is listed twice — only the first one is added.",
      });
      continue;
    }
    seen.add(r.embedUrl);

    const input = gameCreateSchema.safeParse({
      title: r.title,
      embedUrl: r.embedUrl,
      iconUrl: r.iconUrl,
      categoryId: null,
      adPlacement: "GAME_INTERSTITIAL",
      isActive,
      scoreTrusted: connected,
      scoreRewardEnabled: connected,
      scorePointsPer1000: connected ? pointsPer1000 : 0,
    });
    if (!input.success) {
      problems.push({
        line: raw.line,
        title: r.title,
        reason: input.error.issues[0]?.message ?? "Invalid row",
      });
      continue;
    }
    const configErr = gameConfigError(input.data);
    if (configErr) {
      problems.push({ line: raw.line, title: r.title, reason: configErr });
      continue;
    }
    parsed.push({ line: raw.line, category: r.category, data: input.data });
  }

  // Already in the catalog → skip, never a duplicate listing.
  const existing = parsed.length
    ? await prisma.game.findMany({
        where: { embedUrl: { in: parsed.map((p) => p.data.embedUrl) } },
        select: { embedUrl: true },
      })
    : [];
  const existingUrls = new Set(existing.map((g) => g.embedUrl));
  const fresh = parsed.filter((p) => {
    if (!existingUrls.has(p.data.embedUrl)) return true;
    problems.push({ line: p.line, title: p.data.title, reason: "Already added." });
    return false;
  });

  // Categories: match an existing one by name or slug; otherwise create it.
  const categoriesCreated: string[] = [];
  const wanted = fresh.filter((p) => p.category);
  if (wanted.length) {
    let cats = await prisma.gameCategory.findMany({ select: { id: true, name: true, slug: true } });
    const toCreate = new Map<string, string>(); // slug → name
    for (const p of wanted) {
      if (matchGameCategory(p.category, cats)) continue;
      const slug = slugify(p.category);
      if (slug && !toCreate.has(slug)) toCreate.set(slug, p.category);
    }
    if (toCreate.size) {
      await prisma.gameCategory.createMany({
        data: [...toCreate].map(([slug, name]) => ({ slug, name })),
        skipDuplicates: true,
      });
      categoriesCreated.push(...toCreate.values());
      cats = await prisma.gameCategory.findMany({ select: { id: true, name: true, slug: true } });
    }
    for (const p of wanted) {
      p.data.categoryId = matchGameCategory(p.category, cats)?.id ?? null;
    }
  }

  const data: Prisma.GameCreateManyInput[] = fresh.map((p) => ({
    ...p.data,
    createdById: actorId,
  }));
  const created = data.length ? (await prisma.game.createMany({ data })).count : 0;

  if (created > 0 || categoriesCreated.length > 0) {
    await writeAudit({
      actorId,
      action: "GAME_BULK_CREATED",
      entity: "Game",
      summary:
        `Bulk-added ${created} game${created === 1 ? "" : "s"}` +
        (categoriesCreated.length
          ? ` and ${categoriesCreated.length} new categor${categoriesCreated.length === 1 ? "y" : "ies"}`
          : "") +
        (connected ? ` (connected, ${pointsPer1000} pts per 1,000)` : ""),
      meta: {
        created,
        titles: fresh.map((p) => p.data.title),
        skipped: problems.length,
        categoriesCreated,
        isActive,
        connected,
        pointsPer1000: connected ? pointsPer1000 : 0,
      },
    });
  }

  problems.sort((a, b) => a.line - b.line);
  return NextResponse.json(
    { success: true, created, problems, categoriesCreated },
    { status: created > 0 ? 201 : 200 }
  );
}
