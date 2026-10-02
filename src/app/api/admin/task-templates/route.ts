import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAny } from "@/lib/permissions";
import { TASK_CREATE_PERMISSIONS, type Permission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { Prisma } from "@/generated/prisma/client";
import {
  isMissingTableError,
  parseTemplateInput,
  STARTER_TEMPLATES,
  TEMPLATE_PAGE_SIZE,
  TEMPLATE_TASK_TYPES,
  TEMPLATES_NOT_READY,
  type TemplateInput,
  type TemplateListResponse,
} from "@/lib/instruction-templates";

/** Anyone who can see tasks or build one may read templates (the task form uses them). */
const READ_PERMS: Permission[] = ["tasks.view", "tasks.create", "tasks.edit", ...TASK_CREATE_PERMISSIONS];
/** Saving a new template: anyone who can create or edit a task. */
const CREATE_PERMS: Permission[] = ["tasks.create", "tasks.edit", ...TASK_CREATE_PERMISSIONS];

const SELECT = {
  id: true,
  name: true,
  category: true,
  taskType: true,
  contentHtml: true,
  usageCount: true,
  updatedAt: true,
} as const;

/**
 * GET /api/admin/task-templates?q=&category=&taskType=&anyType=1&page=
 *
 * Exactly two queries, in parallel: the page of templates (take N+1 for
 * `hasMore`, no count query) and the category counts (groupBy) for the chips.
 * A missing table answers `ready: false` with 200 — the picker shows "not set
 * up yet" and the task form carries on.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAny(session.user.id, READ_PERMS))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const category = (sp.get("category") ?? "").trim().slice(0, 60);
  const taskTypeRaw = (sp.get("taskType") ?? "").trim().toUpperCase();
  const taskType = (TEMPLATE_TASK_TYPES as readonly string[]).includes(taskTypeRaw)
    ? taskTypeRaw
    : "";
  // The picker wants "this type OR untyped"; the manage page wants exact.
  const anyType = sp.get("anyType") === "1";
  const page = Math.max(1, Math.min(1000, parseInt(sp.get("page") ?? "1", 10) || 1));

  const and: Prisma.InstructionTemplateWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { contentHtml: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (category) and.push({ category });
  if (taskType) {
    and.push(anyType ? { OR: [{ taskType }, { taskType: null }] } : { taskType });
  }

  try {
    const [rows, groups] = await Promise.all([
      prisma.instructionTemplate.findMany({
        where: and.length ? { AND: and } : undefined,
        orderBy: [{ usageCount: "desc" }, { name: "asc" }],
        skip: (page - 1) * TEMPLATE_PAGE_SIZE,
        take: TEMPLATE_PAGE_SIZE + 1,
        select: SELECT,
      }),
      prisma.instructionTemplate.groupBy({
        by: ["category"],
        _count: { _all: true },
      }),
    ]);

    const body: TemplateListResponse = {
      ready: true,
      templates: rows.slice(0, TEMPLATE_PAGE_SIZE).map((r) => ({
        ...r,
        updatedAt: r.updatedAt.toISOString(),
      })),
      // Prisma's groupBy type is lost inside Promise.all; this is its shape.
      categories: (groups as unknown as { category: string; _count: { _all: number } }[])
        .map((g) => ({ category: g.category, count: g._count._all }))
        .sort((x, y) => x.category.localeCompare(y.category)),
      hasMore: rows.length > TEMPLATE_PAGE_SIZE,
      page,
    };
    return NextResponse.json(body);
  } catch (e) {
    if (isMissingTableError(e)) {
      const body: TemplateListResponse = {
        ready: false,
        templates: [],
        categories: [],
        hasMore: false,
        page: 1,
      };
      return NextResponse.json(body);
    }
    console.error("task-templates GET failed:", e);
    return NextResponse.json({ error: "Couldn't load templates" }, { status: 500 });
  }
}

/**
 * POST /api/admin/task-templates
 *   { name, category, taskType?, contentHtml }  → create one (1 query + audit)
 *   { starters: true }                          → add the starter set (1 createMany + audit)
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAny(session.user.id, CREATE_PERMS))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actorId = session.user.id;
  const body = await request.json().catch(() => null);

  try {
    if (body && (body as { starters?: unknown }).starters === true) {
      // Run the starters through the same parser as a typed-in template, so
      // there is exactly one write path for contentHtml (sanitised).
      const data = STARTER_TEMPLATES.map((t) => {
        const parsed = parseTemplateInput(t);
        if (!parsed.ok) throw new Error(parsed.error);
        return { ...(parsed.data as TemplateInput), createdById: actorId, updatedById: actorId };
      });
      const res = await prisma.instructionTemplate.createMany({ data, skipDuplicates: true });
      await writeAudit({
        actorId,
        action: "INSTRUCTION_TEMPLATES_STARTERS_ADDED",
        entity: "InstructionTemplate",
        summary: `Added ${res.count} starter instruction template${res.count === 1 ? "" : "s"}`,
        meta: { count: res.count },
      });
      return NextResponse.json({ success: true, count: res.count }, { status: 201 });
    }

    const parsed = parseTemplateInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.data as TemplateInput;

    const created = await prisma.instructionTemplate.create({
      data: { ...input, createdById: actorId, updatedById: actorId },
      select: SELECT,
    });
    await writeAudit({
      actorId,
      action: "INSTRUCTION_TEMPLATE_CREATED",
      entity: "InstructionTemplate",
      entityId: created.id,
      summary: `Created instruction template "${created.name}" (${created.category})`,
      meta: { name: created.name, category: created.category, taskType: created.taskType },
    });
    return NextResponse.json(
      { success: true, template: { ...created, updatedAt: created.updatedAt.toISOString() } },
      { status: 201 }
    );
  } catch (e) {
    if (isMissingTableError(e)) {
      return NextResponse.json({ error: TEMPLATES_NOT_READY }, { status: 503 });
    }
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        { error: "A template with that name already exists" },
        { status: 409 }
      );
    }
    console.error("task-templates POST failed:", e);
    return NextResponse.json({ error: "Couldn't save the template" }, { status: 500 });
  }
}
