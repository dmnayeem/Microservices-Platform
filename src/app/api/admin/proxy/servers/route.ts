import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2).max(80),
  host: z.string().min(2).max(120),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["HTTP", "HTTPS", "SOCKS5"]).default("HTTPS"),
  country: z.string().max(8).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ERROR"]).default("ACTIVE"),
  maxConcurrent: z.number().int().min(1).default(50),
  bandwidthMbUser: z.number().int().min(1).default(100),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "proxy.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const server = await prisma.proxyServer.create({ data: v.data });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "PROXY_SERVER_CREATED",
      entity: "ProxyServer",
      entityId: server.id,
      newData: { name: server.name, host: server.host, port: server.port },
    },
  });
  return NextResponse.json({ success: true, server }, { status: 201 });
}
