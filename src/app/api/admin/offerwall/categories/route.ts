import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { z } from "zod";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
  "category";

const schema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  order: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/admin/offerwall/categories — list with offer counts.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.view")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const categories = await prisma.offerwallCategory.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { offers: true } } },
  });
  return NextResponse.json({ categories });
}

// POST /api/admin/offerwall/categories — create.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  // Unique slug (append -2, -3… on collision).
  let slug = slugify(d.name);
  for (let i = 2; await prisma.offerwallCategory.findUnique({ where: { slug } }); i++) {
    slug = `${slugify(d.name)}-${i}`;
  }

  try {
    const category = await prisma.offerwallCategory.create({
      data: {
        name: d.name.trim(),
        slug,
        description: d.description?.trim() || null,
        icon: d.icon?.trim() || null,
        color: d.color?.trim() || null,
        order: d.order ?? 0,
        isActive: d.isActive ?? true,
      },
    });
    return NextResponse.json({ category });
  } catch {
    return NextResponse.json({ error: "A category with that name already exists." }, { status: 409 });
  }
}
