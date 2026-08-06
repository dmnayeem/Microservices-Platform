import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  apiKey: z.string().optional().nullable(),
  secretKey: z.string().optional().nullable(),
  callbackUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !(await can(session.user.id, "offerwalls.manage"))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const v = updateSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const existing = await prisma.offerwallConfig.findUnique({ where: { id } });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data: Record<string, unknown> = { ...v.data };
  if (data.config !== undefined) {
    data.config =
      data.config === null ? null : JSON.parse(JSON.stringify(data.config));
  }
  const ow = await prisma.offerwallConfig.update({
    where: { id },
    data,
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "OFFERWALL_UPDATED",
      entity: "OfferwallConfig",
      entityId: id,
      newData: JSON.parse(JSON.stringify(v.data)),
    },
  });
  return NextResponse.json({ success: true, offerwall: ow });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !(await can(session.user.id, "offerwalls.manage"))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.offerwallConfig.findUnique({ where: { id } });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.offerwallConfig.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "OFFERWALL_DELETED",
      entity: "OfferwallConfig",
      entityId: id,
      oldData: { provider: existing.provider },
    },
  });
  return NextResponse.json({ success: true });
}
