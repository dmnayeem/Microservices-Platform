import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAny } from "@/lib/permissions";
import type { Permission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  isMissingTableError,
  parseTemplateInput,
  TEMPLATES_NOT_READY,
} from "@/lib/instruction-templates";

/**
 * Editing or deleting a shared template changes it for every admin, so it
 * takes a full task permission — not just a per-type create grant.
 */
const MANAGE_PERMS: Permission[] = ["tasks.create", "tasks.edit"];

type Ctx = { params: Promise<{ id: string }> };

function failed(e: unknown, what: string) {
  const code = (e as { code?: string })?.code;
  if (isMissingTableError(e)) {
    return NextResponse.json({ error: TEMPLATES_NOT_READY }, { status: 503 });
  }
  if (code === "P2025") {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  if (code === "P2002") {
    return NextResponse.json(
      { error: "A template with that name already exists" },
      { status: 409 }
    );
  }
  console.error(`task-templates ${what} failed:`, e);
  return NextResponse.json({ error: `Couldn't ${what} the template` }, { status: 500 });
}

/** PATCH: one update (returns the row, so no read-before-write) + audit. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAny(session.user.id, MANAGE_PERMS))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = parseTemplateInput(await request.json().catch(() => null), true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const updated = await prisma.instructionTemplate.update({
      where: { id },
      data: { ...parsed.data, updatedById: session.user.id },
      select: { id: true, name: true, category: true, taskType: true, contentHtml: true, usageCount: true, updatedAt: true },
    });
    await writeAudit({
      actorId: session.user.id,
      action: "INSTRUCTION_TEMPLATE_UPDATED",
      entity: "InstructionTemplate",
      entityId: id,
      summary: `Edited instruction template "${updated.name}"`,
      meta: { fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({
      success: true,
      template: { ...updated, updatedAt: updated.updatedAt.toISOString() },
    });
  } catch (e) {
    return failed(e, "update");
  }
}

/** DELETE: one delete (returns the row for the audit) + audit. Tasks keep their copies. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAny(session.user.id, MANAGE_PERMS))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const gone = await prisma.instructionTemplate.delete({
      where: { id },
      select: { name: true, category: true, taskType: true, contentHtml: true, usageCount: true },
    });
    // The row is gone after this, so the audit keeps the content.
    await writeAudit({
      actorId: session.user.id,
      action: "INSTRUCTION_TEMPLATE_DELETED",
      entity: "InstructionTemplate",
      entityId: id,
      summary: `Deleted instruction template "${gone.name}" (${gone.category})`,
      meta: { ...gone },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return failed(e, "delete");
  }
}
