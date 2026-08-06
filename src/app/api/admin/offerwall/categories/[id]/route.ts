import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const schema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(300).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  order: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name.trim();
  if (d.description !== undefined) data.description = d.description?.trim() || null;
  if (d.icon !== undefined) data.icon = d.icon?.trim() || null;
  if (d.color !== undefined) data.color = d.color?.trim() || null;
  if (d.order !== undefined) data.order = d.order;
  if (d.isActive !== undefined) data.isActive = d.isActive;

  try {
    const category = await prisma.offerwallCategory.update({ where: { id }, data });
    return NextResponse.json({ category });
  } catch {
    return NextResponse.json({ error: "Category not found or name taken." }, { status: 400 });
  }
}

// DELETE cascades to its offers (and their completions) via the schema FK.
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.offerwallCategory.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
