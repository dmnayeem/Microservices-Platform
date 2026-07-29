import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CourseStatus } from "@/generated/prisma";
import { toNum, toNumOrNull } from "@/lib/money";

// GET /api/courses
//   q                — full-text-ish search across title / subtitle / description
//   categoryId       — filter by CourseCategory.id
//   skillLevel       — BEGINNER | INTERMEDIATE | ADVANCED | ALL_LEVELS
//   language         — ISO code
//   price            — "free" | "paid"
//   priceMin, priceMax — numeric range
//   minRating        — min avgRating
//   sort             — "newest" | "popular" | "rating" | "price-asc" | "price-desc"
//   page, limit
//
// Returns: { rows, total, totalPages, facets: { categories, skillLevels, languages, freeCount, paidCount } }
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);

    const q = (searchParams.get("q") ?? searchParams.get("search") ?? "").trim();
    const categoryId = searchParams.get("categoryId");
    const subcategoryId = searchParams.get("subcategoryId");
    const skillLevel = searchParams.get("skillLevel");
    const language = searchParams.get("language");
    const priceParam = searchParams.get("price"); // "free" | "paid"
    const priceMin = parseFloatOrNull(searchParams.get("priceMin"));
    const priceMax = parseFloatOrNull(searchParams.get("priceMax"));
    const minRating = parseFloatOrNull(searchParams.get("minRating"));
    const sort = (searchParams.get("sort") ?? "newest").toLowerCase();
    const featuredOnly = searchParams.get("featured") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(60, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    // Self-heal expired promotions so they stop floating to the top.
    void prisma.course
      .updateMany({
        where: { isFeatured: true, featuredUntil: { lt: new Date() } },
        data: { isFeatured: false },
      })
      .catch(() => {});

    const where: Record<string, unknown> = {
      status: CourseStatus.PUBLISHED,
      nsfw: false,
    };
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { subtitle: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (subcategoryId) where.subcategoryId = subcategoryId;
    if (skillLevel) where.skillLevel = skillLevel;
    if (language) where.language = language;
    if (priceParam === "free") where.isFree = true;
    if (priceParam === "paid") where.isFree = false;
    if (priceMin !== null || priceMax !== null) {
      const range: Record<string, number> = {};
      if (priceMin !== null) range.gte = priceMin;
      if (priceMax !== null) range.lte = priceMax;
      where.price = range;
    }
    if (minRating !== null) where.avgRating = { gte: minRating };
    if (featuredOnly) where.isFeatured = true;

    const orderBy: Record<string, "asc" | "desc"> = (() => {
      switch (sort) {
        case "popular":
          return { enrollmentCount: "desc" } as Record<string, "asc" | "desc">;
        case "rating":
          return { avgRating: "desc" } as Record<string, "asc" | "desc">;
        case "price-asc":
          return { price: "asc" } as Record<string, "asc" | "desc">;
        case "price-desc":
          return { price: "desc" } as Record<string, "asc" | "desc">;
        case "newest":
        default:
          return { publishedAt: "desc" } as Record<string, "asc" | "desc">;
      }
    })();

    const [rowsRaw, total, facets] = await Promise.all([
      prisma.course.findMany({
        where,
        orderBy: [orderBy, { id: "desc" }],
        skip,
        take: limit,
        include: {
          tutor: { select: { id: true, name: true, avatar: true } },
          _count: { select: { lessons: true, enrollments: true, reviews: true } },
        },
      }),
      prisma.course.count({ where }),
      // Facets — counts from the published, non-NSFW pool (ignore current
      // filters), plus a subcategory facet scoped to the selected category.
      buildFacets(categoryId),
    ]);

    const rows = rowsRaw as unknown as Array<{
      id: string;
      slug: string | null;
      title: string;
      subtitle: string | null;
      description: string;
      thumbnail: string | null;
      promoVideoUrl: string | null;
      category: string;
      categoryId: string | null;
      skillLevel: string;
      language: string;
      price: number;
      originalPrice: number | null;
      discountPrice: number | null;
      isFree: boolean;
      totalLessons: number;
      totalDuration: number;
      enrollmentCount: number;
      avgRating: number;
      totalReviews: number;
      isFeatured: boolean;
      publishedAt: Date | null;
      tutor: { id: string; name: string | null; avatar: string | null } | null;
      _count: { lessons: number; enrollments: number; reviews: number };
    }>;

    // Pull the user's enrollments + bookmarks for these courses, in one round-trip
    let enrolled: Set<string> = new Set();
    let bookmarked: Set<string> = new Set();
    if (session?.user?.id && rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const [enrolls, marks] = await Promise.all([
        prisma.courseEnrollment.findMany({
          where: { userId: session.user.id, courseId: { in: ids } },
          select: { courseId: true },
        }),
        prisma.courseBookmark.findMany({
          where: { userId: session.user.id, courseId: { in: ids } },
          select: { courseId: true },
        }),
      ]);
      enrolled = new Set(enrolls.map((e) => e.courseId));
      bookmarked = new Set(marks.map((m) => m.courseId));
    }

    const cards = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      subtitle: r.subtitle,
      thumbnail: r.thumbnail,
      promoVideoUrl: r.promoVideoUrl,
      categoryId: r.categoryId,
      category: r.category,
      skillLevel: r.skillLevel,
      language: r.language,
      isFree: r.isFree,
      price: toNum(r.price),
      originalPrice: toNumOrNull(r.originalPrice),
      discountPrice: toNumOrNull(r.discountPrice),
      totalLessons: r._count.lessons,
      totalDuration: r.totalDuration,
      enrollmentCount: r.enrollmentCount,
      avgRating: r.avgRating,
      totalReviews: r.totalReviews,
      isFeatured: r.isFeatured,
      tutor: r.tutor,
      isEnrolled: enrolled.has(r.id),
      isBookmarked: bookmarked.has(r.id),
      href: `/courses/${r.slug ?? r.id}`,
    }));

    return NextResponse.json({
      rows: cards,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      facets,
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch courses" },
      { status: 500 }
    );
  }
}

function parseFloatOrNull(s: string | null): number | null {
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

async function buildFacets(categoryId?: string | null) {
  const baseWhere = { status: CourseStatus.PUBLISHED, nsfw: false };
  const [categoryRows, skillLevels, languages, freeCount, paidCount, total, subcatRows] =
    await Promise.all([
      prisma.course.groupBy({
        by: ["categoryId"],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.course.groupBy({
        by: ["skillLevel"],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.course.groupBy({
        by: ["language"],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.course.count({ where: { ...baseWhere, isFree: true } }),
      prisma.course.count({ where: { ...baseWhere, isFree: false } }),
      prisma.course.count({ where: baseWhere }),
      // Subcategories only matter once a category is chosen.
      categoryId
        ? prisma.course.groupBy({
            by: ["subcategoryId"],
            where: { ...baseWhere, categoryId },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

  const catRows = categoryRows as unknown as Array<{
    categoryId: string | null;
    _count: { _all: number };
  }>;
  // Resolve subcategory names for the selected category's facet.
  const subRows = subcatRows as unknown as Array<{
    subcategoryId: string | null;
    _count: { _all: number };
  }>;
  const subIds = subRows.map((s) => s.subcategoryId).filter(Boolean) as string[];
  const subs = subIds.length
    ? ((await prisma.courseSubcategory.findMany({
        where: { id: { in: subIds } },
        select: { id: true, name: true },
      })) as Array<{ id: string; name: string }>)
    : [];
  const subMap = new Map(subs.map((s) => [s.id, s.name]));

  const catIds = catRows.map((c) => c.categoryId).filter(Boolean) as string[];
  const cats = catIds.length
    ? ((await prisma.courseCategory.findMany({
        where: { id: { in: catIds } },
        select: { id: true, slug: true, name: true, color: true, iconKey: true },
      })) as Array<{
        id: string;
        slug: string;
        name: string;
        color: string | null;
        iconKey: string | null;
      }>)
    : [];
  const catMap = new Map(cats.map((c) => [c.id, c]));

  return {
    total,
    categories: catRows
      .map((c) => {
        const meta = c.categoryId ? catMap.get(c.categoryId) : null;
        return {
          id: c.categoryId,
          slug: meta?.slug ?? null,
          name: meta?.name ?? "Uncategorised",
          color: meta?.color ?? null,
          iconKey: meta?.iconKey ?? null,
          count: c._count._all,
        };
      })
      .filter((c) => c.id !== null),
    subcategories: subRows
      .filter((s) => s.subcategoryId !== null)
      .map((s) => ({
        id: s.subcategoryId as string,
        name: subMap.get(s.subcategoryId as string) ?? "Other",
        count: s._count._all,
      })),
    skillLevels: (skillLevels as Array<{ skillLevel: string; _count: { _all: number } }>).map((s) => ({
      value: s.skillLevel,
      count: s._count._all,
    })),
    languages: (languages as Array<{ language: string; _count: { _all: number } }>).map((s) => ({
      value: s.language,
      count: s._count._all,
    })),
    freeCount,
    paidCount,
  };
}
