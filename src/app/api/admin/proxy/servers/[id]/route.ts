import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  host: z.string().min(2).max(120).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["HTTP", "HTTPS", "SOCKS5"]).optional(),
  country: z.string().max(8).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ERROR"]).optional(),
  maxConcurrent: z.number().int().min(1).optional(),
  bandwidthMbUser: z.number().int().min(1).optional(),
  loadPercent: z.number().int().min(0).max(100).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "proxy.manage"))) {
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
  const existing = await prisma.proxyServer.findUnique({ where: { id } });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const server = await prisma.proxyServer.update({
    where: { id },
    data: v.data,
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "PROXY_SERVER_UPDATED",
      entity: "ProxyServer",
      entityId: id,
      newData: JSON.parse(JSON.stringify(v.data)),
    },
  });
  return NextResponse.json({ success: true, server });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "proxy.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.proxyServer.findUnique({ where: { id } });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.proxyServer.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "PROXY_SERVER_DELETED",
      entity: "ProxyServer",
      entityId: id,
      oldData: { name: existing.name, host: existing.host },
    },
  });
  return NextResponse.json({ success: true });
}
